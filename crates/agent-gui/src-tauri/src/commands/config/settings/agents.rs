fn load_agents(conn: &Connection) -> Result<Option<Value>, String> {
    let mut profile_stmt = conn
        .prepare(SUBAGENT_ROLE_PROFILES_SELECT_SQL)
        .map_err(|e| format!("准备读取 {SUBAGENT_ROLE_PROFILES_TABLE} 失败：{e}"))?;
    let profile_rows = profile_stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|e| format!("读取 {SUBAGENT_ROLE_PROFILES_TABLE} 失败：{e}"))?;
    let mut profiles = HashMap::new();
    for row in profile_rows {
        let (template_id, payload_json) =
            row.map_err(|e| format!("读取 {SUBAGENT_ROLE_PROFILES_TABLE} 行失败：{e}"))?;
        if let Ok(Value::Object(profile)) = serde_json::from_str::<Value>(&payload_json) {
            profiles.insert(template_id, profile);
        }
    }

    let mut stmt = conn
        .prepare(AGENT_PROMPT_TEMPLATES_SELECT_SQL)
        .map_err(|e| format!("准备读取 {AGENT_PROMPT_TEMPLATES_TABLE} 失败：{e}"))?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
            ))
        })
        .map_err(|e| format!("读取 {AGENT_PROMPT_TEMPLATES_TABLE} 失败：{e}"))?;

    let mut templates = Vec::new();
    for row in rows {
        let (template_id, name, description, prompt, enabled) =
            row.map_err(|e| format!("读取 {AGENT_PROMPT_TEMPLATES_TABLE} 行失败：{e}"))?;
        let mut template = Map::from_iter([
            ("id".to_string(), Value::String(template_id)),
            ("name".to_string(), Value::String(name)),
            ("description".to_string(), Value::String(description)),
            ("prompt".to_string(), Value::String(prompt)),
            ("enabled".to_string(), Value::Bool(enabled != 0)),
        ]);
        if let Some(profile) = profiles.remove(template["id"].as_str().unwrap_or_default()) {
            for key in [
                "subagentEnabled",
                "selectedModel",
                "thinkingEnabled",
                "reasoning",
            ] {
                if let Some(value) = profile.get(key) {
                    if !value.is_null() {
                        template.insert(key.to_string(), value.clone());
                    }
                }
            }
        } else {
            // Before role profiles existed, enabled also exposed the template
            // to delegated agents. Keep that behavior during migration.
            template.insert("subagentEnabled".to_string(), Value::Bool(enabled != 0));
        }
        templates.push(Value::Object(template));
    }

    if templates.is_empty() {
        Ok(None)
    } else {
        Ok(Some(Value::Array(templates)))
    }
}
fn save_agents(conn: &mut Connection, payload: Value) -> Result<(), String> {
    let templates = expect_array(payload, "settings_save_agents payload")?;
    let updated_at = now_ms();
    let tx = conn
        .transaction()
        .map_err(|e| format!("开启 {AGENT_PROMPT_TEMPLATES_TABLE} 事务失败：{e}"))?;
    tx.execute(AGENT_PROMPT_TEMPLATES_DELETE_SQL, [])
        .map_err(|e| format!("清空 {AGENT_PROMPT_TEMPLATES_TABLE} 失败：{e}"))?;
    tx.execute(SUBAGENT_ROLE_PROFILES_DELETE_SQL, [])
        .map_err(|e| format!("清空 {SUBAGENT_ROLE_PROFILES_TABLE} 失败：{e}"))?;

    let mut seen = HashSet::new();
    let mut enabled_template_id: Option<String> = None;
    let mut enabled_role_count = 0_usize;
    for (sort_index, template) in templates.into_iter().enumerate() {
        let template = expect_object(template, "settings_save_agents payload[]")?;
        let template_id =
            extract_non_empty_string(&template, "id", "settings_save_agents payload[]")?;
        if !seen.insert(template_id.clone()) {
            return Err(format!(
                "{AGENT_PROMPT_TEMPLATES_TABLE}.template_id 重复：{template_id}"
            ));
        }

        let name = extract_non_empty_string(&template, "name", "settings_save_agents payload[]")?;
        let prompt =
            extract_non_empty_string(&template, "prompt", "settings_save_agents payload[]")?;
        let description = extract_optional_string(&template, "description");
        let enabled = match template.get("enabled") {
            Some(Value::Bool(value)) => *value,
            Some(Value::Null) | None => false,
            Some(_) => {
                return Err("settings_save_agents payload[].enabled 必须是布尔值".to_string());
            }
        };
        if enabled {
            if let Some(existing_id) = &enabled_template_id {
                return Err(format!(
                    "{AGENT_PROMPT_TEMPLATES_TABLE}.enabled 只能有一个激活项：{existing_id}, {template_id}"
                ));
            }
            enabled_template_id = Some(template_id.clone());
        }
        let subagent_enabled = match template.get("subagentEnabled") {
            Some(Value::Bool(value)) => *value,
            Some(Value::Null) | None => enabled,
            Some(_) => {
                return Err(
                    "settings_save_agents payload[].subagentEnabled 必须是布尔值".to_string(),
                );
            }
        };
        if subagent_enabled {
            enabled_role_count += 1;
            if enabled_role_count > 12 {
                return Err("settings_save_agents 最多只能启用 12 个子代理角色".to_string());
            }
        }
        let selected_model = template
            .get("selectedModel")
            .cloned()
            .unwrap_or(Value::Null);
        if !selected_model.is_null() && !selected_model.is_object() {
            return Err(
                "settings_save_agents payload[].selectedModel 必须是对象或 null".to_string(),
            );
        }
        let thinking_enabled = template
            .get("thinkingEnabled")
            .cloned()
            .unwrap_or(Value::Null);
        if !thinking_enabled.is_null() && !thinking_enabled.is_boolean() {
            return Err(
                "settings_save_agents payload[].thinkingEnabled 必须是布尔值或 null".to_string(),
            );
        }
        let reasoning = template.get("reasoning").cloned().unwrap_or(Value::Null);
        if !reasoning.is_null() && !reasoning.is_string() {
            return Err("settings_save_agents payload[].reasoning 必须是字符串或 null".to_string());
        }

        tx.execute(
            AGENT_PROMPT_TEMPLATES_INSERT_SQL,
            params![
                template_id,
                name,
                description,
                prompt,
                if enabled { 1_i64 } else { 0_i64 },
                sort_index as i64,
                updated_at
            ],
        )
        .map_err(|e| format!("写入 {AGENT_PROMPT_TEMPLATES_TABLE} 失败：{e}"))?;
        let profile_json = json!({
            "version": 1,
            "subagentEnabled": subagent_enabled,
            "selectedModel": selected_model,
            "thinkingEnabled": thinking_enabled,
            "reasoning": reasoning,
        })
        .to_string();
        tx.execute(
            SUBAGENT_ROLE_PROFILES_INSERT_SQL,
            params![template_id, profile_json, updated_at],
        )
        .map_err(|e| format!("写入 {SUBAGENT_ROLE_PROFILES_TABLE} 失败：{e}"))?;
    }

    tx.commit()
        .map_err(|e| format!("提交 {AGENT_PROMPT_TEMPLATES_TABLE} 事务失败：{e}"))?;
    // 标脏放在 commit 之后：事务回滚时不该触发自动同步。
    crate::services::webdav_auto_sync::mark_dirty();
    Ok(())
}
