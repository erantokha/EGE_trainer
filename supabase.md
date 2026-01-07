| table_schema | table_name                 | ordinal_position | column_name                  | data_type                   | is_nullable | column_default                                  |
| ------------ | -------------------------- | ---------------- | ---------------------------- | --------------------------- | ----------- | ----------------------------------------------- |
| auth         | audit_log_entries          | 1                | instance_id                  | uuid                        | YES         | null                                            |
| auth         | audit_log_entries          | 2                | id                           | uuid                        | NO          | null                                            |
| auth         | audit_log_entries          | 3                | payload                      | json                        | YES         | null                                            |
| auth         | audit_log_entries          | 4                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | audit_log_entries          | 5                | ip_address                   | character varying           | NO          | ''::character varying                           |
| auth         | flow_state                 | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | flow_state                 | 2                | user_id                      | uuid                        | YES         | null                                            |
| auth         | flow_state                 | 3                | auth_code                    | text                        | NO          | null                                            |
| auth         | flow_state                 | 4                | code_challenge_method        | USER-DEFINED                | NO          | null                                            |
| auth         | flow_state                 | 5                | code_challenge               | text                        | NO          | null                                            |
| auth         | flow_state                 | 6                | provider_type                | text                        | NO          | null                                            |
| auth         | flow_state                 | 7                | provider_access_token        | text                        | YES         | null                                            |
| auth         | flow_state                 | 8                | provider_refresh_token       | text                        | YES         | null                                            |
| auth         | flow_state                 | 9                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | flow_state                 | 10               | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | flow_state                 | 11               | authentication_method        | text                        | NO          | null                                            |
| auth         | flow_state                 | 12               | auth_code_issued_at          | timestamp with time zone    | YES         | null                                            |
| auth         | identities                 | 1                | provider_id                  | text                        | NO          | null                                            |
| auth         | identities                 | 2                | user_id                      | uuid                        | NO          | null                                            |
| auth         | identities                 | 3                | identity_data                | jsonb                       | NO          | null                                            |
| auth         | identities                 | 4                | provider                     | text                        | NO          | null                                            |
| auth         | identities                 | 5                | last_sign_in_at              | timestamp with time zone    | YES         | null                                            |
| auth         | identities                 | 6                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | identities                 | 7                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | identities                 | 8                | email                        | text                        | YES         | null                                            |
| auth         | identities                 | 9                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| auth         | instances                  | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | instances                  | 2                | uuid                         | uuid                        | YES         | null                                            |
| auth         | instances                  | 3                | raw_base_config              | text                        | YES         | null                                            |
| auth         | instances                  | 4                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | instances                  | 5                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | mfa_amr_claims             | 1                | session_id                   | uuid                        | NO          | null                                            |
| auth         | mfa_amr_claims             | 2                | created_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | mfa_amr_claims             | 3                | updated_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | mfa_amr_claims             | 4                | authentication_method        | text                        | NO          | null                                            |
| auth         | mfa_amr_claims             | 5                | id                           | uuid                        | NO          | null                                            |
| auth         | mfa_challenges             | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | mfa_challenges             | 2                | factor_id                    | uuid                        | NO          | null                                            |
| auth         | mfa_challenges             | 3                | created_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | mfa_challenges             | 4                | verified_at                  | timestamp with time zone    | YES         | null                                            |
| auth         | mfa_challenges             | 5                | ip_address                   | inet                        | NO          | null                                            |
| auth         | mfa_challenges             | 6                | otp_code                     | text                        | YES         | null                                            |
| auth         | mfa_challenges             | 7                | web_authn_session_data       | jsonb                       | YES         | null                                            |
| auth         | mfa_factors                | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | mfa_factors                | 2                | user_id                      | uuid                        | NO          | null                                            |
| auth         | mfa_factors                | 3                | friendly_name                | text                        | YES         | null                                            |
| auth         | mfa_factors                | 4                | factor_type                  | USER-DEFINED                | NO          | null                                            |
| auth         | mfa_factors                | 5                | status                       | USER-DEFINED                | NO          | null                                            |
| auth         | mfa_factors                | 6                | created_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | mfa_factors                | 7                | updated_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | mfa_factors                | 8                | secret                       | text                        | YES         | null                                            |
| auth         | mfa_factors                | 9                | phone                        | text                        | YES         | null                                            |
| auth         | mfa_factors                | 10               | last_challenged_at           | timestamp with time zone    | YES         | null                                            |
| auth         | mfa_factors                | 11               | web_authn_credential         | jsonb                       | YES         | null                                            |
| auth         | mfa_factors                | 12               | web_authn_aaguid             | uuid                        | YES         | null                                            |
| auth         | mfa_factors                | 13               | last_webauthn_challenge_data | jsonb                       | YES         | null                                            |
| auth         | oauth_authorizations       | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | oauth_authorizations       | 2                | authorization_id             | text                        | NO          | null                                            |
| auth         | oauth_authorizations       | 3                | client_id                    | uuid                        | NO          | null                                            |
| auth         | oauth_authorizations       | 4                | user_id                      | uuid                        | YES         | null                                            |
| auth         | oauth_authorizations       | 5                | redirect_uri                 | text                        | NO          | null                                            |
| auth         | oauth_authorizations       | 6                | scope                        | text                        | NO          | null                                            |
| auth         | oauth_authorizations       | 7                | state                        | text                        | YES         | null                                            |
| auth         | oauth_authorizations       | 8                | resource                     | text                        | YES         | null                                            |
| auth         | oauth_authorizations       | 9                | code_challenge               | text                        | YES         | null                                            |
| auth         | oauth_authorizations       | 10               | code_challenge_method        | USER-DEFINED                | YES         | null                                            |
| auth         | oauth_authorizations       | 11               | response_type                | USER-DEFINED                | NO          | 'code'::auth.oauth_response_type                |
| auth         | oauth_authorizations       | 12               | status                       | USER-DEFINED                | NO          | 'pending'::auth.oauth_authorization_status      |
| auth         | oauth_authorizations       | 13               | authorization_code           | text                        | YES         | null                                            |
| auth         | oauth_authorizations       | 14               | created_at                   | timestamp with time zone    | NO          | now()                                           |
| auth         | oauth_authorizations       | 15               | expires_at                   | timestamp with time zone    | NO          | (now() + '00:03:00'::interval)                  |
| auth         | oauth_authorizations       | 16               | approved_at                  | timestamp with time zone    | YES         | null                                            |
| auth         | oauth_authorizations       | 17               | nonce                        | text                        | YES         | null                                            |
| auth         | oauth_client_states        | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | oauth_client_states        | 2                | provider_type                | text                        | NO          | null                                            |
| auth         | oauth_client_states        | 3                | code_verifier                | text                        | YES         | null                                            |
| auth         | oauth_client_states        | 4                | created_at                   | timestamp with time zone    | NO          | null                                            |
| auth         | oauth_clients              | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | oauth_clients              | 3                | client_secret_hash           | text                        | YES         | null                                            |
| auth         | oauth_clients              | 4                | registration_type            | USER-DEFINED                | NO          | null                                            |
| auth         | oauth_clients              | 5                | redirect_uris                | text                        | NO          | null                                            |
| auth         | oauth_clients              | 6                | grant_types                  | text                        | NO          | null                                            |
| auth         | oauth_clients              | 7                | client_name                  | text                        | YES         | null                                            |
| auth         | oauth_clients              | 8                | client_uri                   | text                        | YES         | null                                            |
| auth         | oauth_clients              | 9                | logo_uri                     | text                        | YES         | null                                            |
| auth         | oauth_clients              | 10               | created_at                   | timestamp with time zone    | NO          | now()                                           |
| auth         | oauth_clients              | 11               | updated_at                   | timestamp with time zone    | NO          | now()                                           |
| auth         | oauth_clients              | 12               | deleted_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | oauth_clients              | 13               | client_type                  | USER-DEFINED                | NO          | 'confidential'::auth.oauth_client_type          |
| auth         | oauth_consents             | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | oauth_consents             | 2                | user_id                      | uuid                        | NO          | null                                            |
| auth         | oauth_consents             | 3                | client_id                    | uuid                        | NO          | null                                            |
| auth         | oauth_consents             | 4                | scopes                       | text                        | NO          | null                                            |
| auth         | oauth_consents             | 5                | granted_at                   | timestamp with time zone    | NO          | now()                                           |
| auth         | oauth_consents             | 6                | revoked_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | one_time_tokens            | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | one_time_tokens            | 2                | user_id                      | uuid                        | NO          | null                                            |
| auth         | one_time_tokens            | 3                | token_type                   | USER-DEFINED                | NO          | null                                            |
| auth         | one_time_tokens            | 4                | token_hash                   | text                        | NO          | null                                            |
| auth         | one_time_tokens            | 5                | relates_to                   | text                        | NO          | null                                            |
| auth         | one_time_tokens            | 6                | created_at                   | timestamp without time zone | NO          | now()                                           |
| auth         | one_time_tokens            | 7                | updated_at                   | timestamp without time zone | NO          | now()                                           |
| auth         | refresh_tokens             | 1                | instance_id                  | uuid                        | YES         | null                                            |
| auth         | refresh_tokens             | 2                | id                           | bigint                      | NO          | nextval('auth.refresh_tokens_id_seq'::regclass) |
| auth         | refresh_tokens             | 3                | token                        | character varying           | YES         | null                                            |
| auth         | refresh_tokens             | 4                | user_id                      | character varying           | YES         | null                                            |
| auth         | refresh_tokens             | 5                | revoked                      | boolean                     | YES         | null                                            |
| auth         | refresh_tokens             | 6                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | refresh_tokens             | 7                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | refresh_tokens             | 8                | parent                       | character varying           | YES         | null                                            |
| auth         | refresh_tokens             | 9                | session_id                   | uuid                        | YES         | null                                            |
| auth         | saml_providers             | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | saml_providers             | 2                | sso_provider_id              | uuid                        | NO          | null                                            |
| auth         | saml_providers             | 3                | entity_id                    | text                        | NO          | null                                            |
| auth         | saml_providers             | 4                | metadata_xml                 | text                        | NO          | null                                            |
| auth         | saml_providers             | 5                | metadata_url                 | text                        | YES         | null                                            |
| auth         | saml_providers             | 6                | attribute_mapping            | jsonb                       | YES         | null                                            |
| auth         | saml_providers             | 7                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | saml_providers             | 8                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | saml_providers             | 9                | name_id_format               | text                        | YES         | null                                            |
| auth         | saml_relay_states          | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | saml_relay_states          | 2                | sso_provider_id              | uuid                        | NO          | null                                            |
| auth         | saml_relay_states          | 3                | request_id                   | text                        | NO          | null                                            |
| auth         | saml_relay_states          | 4                | for_email                    | text                        | YES         | null                                            |
| auth         | saml_relay_states          | 5                | redirect_to                  | text                        | YES         | null                                            |
| auth         | saml_relay_states          | 7                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | saml_relay_states          | 8                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | saml_relay_states          | 9                | flow_state_id                | uuid                        | YES         | null                                            |
| auth         | schema_migrations          | 1                | version                      | character varying           | NO          | null                                            |
| auth         | sessions                   | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | sessions                   | 2                | user_id                      | uuid                        | NO          | null                                            |
| auth         | sessions                   | 3                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sessions                   | 4                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sessions                   | 5                | factor_id                    | uuid                        | YES         | null                                            |
| auth         | sessions                   | 6                | aal                          | USER-DEFINED                | YES         | null                                            |
| auth         | sessions                   | 7                | not_after                    | timestamp with time zone    | YES         | null                                            |
| auth         | sessions                   | 8                | refreshed_at                 | timestamp without time zone | YES         | null                                            |
| auth         | sessions                   | 9                | user_agent                   | text                        | YES         | null                                            |
| auth         | sessions                   | 10               | ip                           | inet                        | YES         | null                                            |
| auth         | sessions                   | 11               | tag                          | text                        | YES         | null                                            |
| auth         | sessions                   | 12               | oauth_client_id              | uuid                        | YES         | null                                            |
| auth         | sessions                   | 13               | refresh_token_hmac_key       | text                        | YES         | null                                            |
| auth         | sessions                   | 14               | refresh_token_counter        | bigint                      | YES         | null                                            |
| auth         | sessions                   | 15               | scopes                       | text                        | YES         | null                                            |
| auth         | sso_domains                | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | sso_domains                | 2                | sso_provider_id              | uuid                        | NO          | null                                            |
| auth         | sso_domains                | 3                | domain                       | text                        | NO          | null                                            |
| auth         | sso_domains                | 4                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sso_domains                | 5                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sso_providers              | 1                | id                           | uuid                        | NO          | null                                            |
| auth         | sso_providers              | 2                | resource_id                  | text                        | YES         | null                                            |
| auth         | sso_providers              | 3                | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sso_providers              | 4                | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | sso_providers              | 5                | disabled                     | boolean                     | YES         | null                                            |
| auth         | users                      | 1                | instance_id                  | uuid                        | YES         | null                                            |
| auth         | users                      | 2                | id                           | uuid                        | NO          | null                                            |
| auth         | users                      | 3                | aud                          | character varying           | YES         | null                                            |
| auth         | users                      | 4                | role                         | character varying           | YES         | null                                            |
| auth         | users                      | 5                | email                        | character varying           | YES         | null                                            |
| auth         | users                      | 6                | encrypted_password           | character varying           | YES         | null                                            |
| auth         | users                      | 7                | email_confirmed_at           | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 8                | invited_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 9                | confirmation_token           | character varying           | YES         | null                                            |
| auth         | users                      | 10               | confirmation_sent_at         | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 11               | recovery_token               | character varying           | YES         | null                                            |
| auth         | users                      | 12               | recovery_sent_at             | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 13               | email_change_token_new       | character varying           | YES         | null                                            |
| auth         | users                      | 14               | email_change                 | character varying           | YES         | null                                            |
| auth         | users                      | 15               | email_change_sent_at         | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 16               | last_sign_in_at              | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 17               | raw_app_meta_data            | jsonb                       | YES         | null                                            |
| auth         | users                      | 18               | raw_user_meta_data           | jsonb                       | YES         | null                                            |
| auth         | users                      | 19               | is_super_admin               | boolean                     | YES         | null                                            |
| auth         | users                      | 20               | created_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 21               | updated_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 22               | phone                        | text                        | YES         | NULL::character varying                         |
| auth         | users                      | 23               | phone_confirmed_at           | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 24               | phone_change                 | text                        | YES         | ''::character varying                           |
| auth         | users                      | 25               | phone_change_token           | character varying           | YES         | ''::character varying                           |
| auth         | users                      | 26               | phone_change_sent_at         | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 27               | confirmed_at                 | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 28               | email_change_token_current   | character varying           | YES         | ''::character varying                           |
| auth         | users                      | 29               | email_change_confirm_status  | smallint                    | YES         | 0                                               |
| auth         | users                      | 30               | banned_until                 | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 31               | reauthentication_token       | character varying           | YES         | ''::character varying                           |
| auth         | users                      | 32               | reauthentication_sent_at     | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 33               | is_sso_user                  | boolean                     | NO          | false                                           |
| auth         | users                      | 34               | deleted_at                   | timestamp with time zone    | YES         | null                                            |
| auth         | users                      | 35               | is_anonymous                 | boolean                     | NO          | false                                           |
| public       | attempts                   | 1                | id                           | bigint                      | NO          | null                                            |
| public       | attempts                   | 2                | student_id                   | text                        | YES         | null                                            |
| public       | attempts                   | 3                | student_name                 | text                        | YES         | null                                            |
| public       | attempts                   | 4                | student_email                | text                        | YES         | null                                            |
| public       | attempts                   | 5                | mode                         | text                        | YES         | null                                            |
| public       | attempts                   | 6                | seed                         | text                        | YES         | null                                            |
| public       | attempts                   | 7                | topic_ids                    | ARRAY                       | YES         | null                                            |
| public       | attempts                   | 8                | total                        | integer                     | YES         | null                                            |
| public       | attempts                   | 9                | correct                      | integer                     | YES         | null                                            |
| public       | attempts                   | 10               | avg_ms                       | integer                     | YES         | null                                            |
| public       | attempts                   | 11               | duration_ms                  | integer                     | YES         | null                                            |
| public       | attempts                   | 12               | started_at                   | timestamp with time zone    | YES         | null                                            |
| public       | attempts                   | 13               | finished_at                  | timestamp with time zone    | YES         | null                                            |
| public       | attempts                   | 14               | payload                      | jsonb                       | YES         | null                                            |
| public       | attempts                   | 15               | created_at                   | timestamp with time zone    | YES         | now()                                           |
| public       | homework_attempts          | 1                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| public       | homework_attempts          | 2                | homework_id                  | uuid                        | NO          | null                                            |
| public       | homework_attempts          | 3                | link_id                      | uuid                        | YES         | null                                            |
| public       | homework_attempts          | 4                | token_used                   | text                        | NO          | null                                            |
| public       | homework_attempts          | 5                | student_id                   | uuid                        | NO          | null                                            |
| public       | homework_attempts          | 6                | student_name                 | text                        | NO          | null                                            |
| public       | homework_attempts          | 7                | student_key                  | text                        | NO          | null                                            |
| public       | homework_attempts          | 8                | payload                      | jsonb                       | YES         | null                                            |
| public       | homework_attempts          | 9                | total                        | integer                     | NO          | 0                                               |
| public       | homework_attempts          | 10               | correct                      | integer                     | NO          | 0                                               |
| public       | homework_attempts          | 11               | duration_ms                  | integer                     | NO          | 0                                               |
| public       | homework_attempts          | 12               | started_at                   | timestamp with time zone    | NO          | now()                                           |
| public       | homework_attempts          | 13               | finished_at                  | timestamp with time zone    | YES         | null                                            |
| public       | homework_links             | 1                | token                        | text                        | NO          | null                                            |
| public       | homework_links             | 2                | homework_id                  | uuid                        | NO          | null                                            |
| public       | homework_links             | 3                | is_active                    | boolean                     | NO          | true                                            |
| public       | homework_links             | 4                | expires_at                   | timestamp with time zone    | YES         | null                                            |
| public       | homework_links             | 5                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| public       | homework_links             | 6                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| public       | homework_links             | 7                | owner_id                     | uuid                        | NO          | auth.uid()                                      |
| public       | homeworks                  | 1                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| public       | homeworks                  | 2                | title                        | text                        | NO          | 'Домашнее задание'::text                        |
| public       | homeworks                  | 3                | spec_json                    | jsonb                       | NO          | null                                            |
| public       | homeworks                  | 4                | is_active                    | boolean                     | NO          | true                                            |
| public       | homeworks                  | 5                | attempts_per_student         | integer                     | NO          | 1                                               |
| public       | homeworks                  | 6                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| public       | homeworks                  | 7                | updated_at                   | timestamp with time zone    | NO          | now()                                           |
| public       | homeworks                  | 8                | owner_id                     | uuid                        | NO          | auth.uid()                                      |
| public       | homeworks                  | 9                | seed                         | text                        | YES         | null                                            |
| public       | homeworks                  | 10               | frozen_questions             | jsonb                       | YES         | null                                            |
| public       | homeworks                  | 11               | frozen_at                    | timestamp with time zone    | YES         | null                                            |
| public       | homeworks                  | 12               | description                  | text                        | YES         | null                                            |
| public       | homeworks                  | 13               | settings_json                | jsonb                       | YES         | null                                            |
| public       | profiles                   | 1                | id                           | uuid                        | NO          | null                                            |
| public       | profiles                   | 2                | email                        | text                        | YES         | null                                            |
| public       | profiles                   | 3                | role                         | text                        | NO          | 'student'::text                                 |
| public       | profiles                   | 4                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| public       | teachers                   | 1                | email                        | text                        | NO          | null                                            |
| public       | teachers                   | 2                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| realtime     | messages                   | 3                | topic                        | text                        | NO          | null                                            |
| realtime     | messages                   | 4                | extension                    | text                        | NO          | null                                            |
| realtime     | messages                   | 5                | payload                      | jsonb                       | YES         | null                                            |
| realtime     | messages                   | 6                | event                        | text                        | YES         | null                                            |
| realtime     | messages                   | 7                | private                      | boolean                     | YES         | false                                           |
| realtime     | messages                   | 8                | updated_at                   | timestamp without time zone | NO          | now()                                           |
| realtime     | messages                   | 9                | inserted_at                  | timestamp without time zone | NO          | now()                                           |
| realtime     | messages                   | 10               | id                           | uuid                        | NO          | gen_random_uuid()                               |
| realtime     | schema_migrations          | 1                | version                      | bigint                      | NO          | null                                            |
| realtime     | schema_migrations          | 2                | inserted_at                  | timestamp without time zone | YES         | null                                            |
| realtime     | subscription               | 1                | id                           | bigint                      | NO          | null                                            |
| realtime     | subscription               | 2                | subscription_id              | uuid                        | NO          | null                                            |
| realtime     | subscription               | 4                | entity                       | regclass                    | NO          | null                                            |
| realtime     | subscription               | 5                | filters                      | ARRAY                       | NO          | '{}'::realtime.user_defined_filter[]            |
| realtime     | subscription               | 7                | claims                       | jsonb                       | NO          | null                                            |
| realtime     | subscription               | 8                | claims_role                  | regrole                     | NO          | null                                            |
| realtime     | subscription               | 9                | created_at                   | timestamp without time zone | NO          | timezone('utc'::text, now())                    |
| storage      | buckets                    | 1                | id                           | text                        | NO          | null                                            |
| storage      | buckets                    | 2                | name                         | text                        | NO          | null                                            |
| storage      | buckets                    | 3                | owner                        | uuid                        | YES         | null                                            |
| storage      | buckets                    | 4                | created_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | buckets                    | 5                | updated_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | buckets                    | 6                | public                       | boolean                     | YES         | false                                           |
| storage      | buckets                    | 7                | avif_autodetection           | boolean                     | YES         | false                                           |
| storage      | buckets                    | 8                | file_size_limit              | bigint                      | YES         | null                                            |
| storage      | buckets                    | 9                | allowed_mime_types           | ARRAY                       | YES         | null                                            |
| storage      | buckets                    | 10               | owner_id                     | text                        | YES         | null                                            |
| storage      | buckets                    | 11               | type                         | USER-DEFINED                | NO          | 'STANDARD'::storage.buckettype                  |
| storage      | buckets_analytics          | 1                | name                         | text                        | NO          | null                                            |
| storage      | buckets_analytics          | 2                | type                         | USER-DEFINED                | NO          | 'ANALYTICS'::storage.buckettype                 |
| storage      | buckets_analytics          | 3                | format                       | text                        | NO          | 'ICEBERG'::text                                 |
| storage      | buckets_analytics          | 4                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | buckets_analytics          | 5                | updated_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | buckets_analytics          | 6                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| storage      | buckets_analytics          | 7                | deleted_at                   | timestamp with time zone    | YES         | null                                            |
| storage      | buckets_vectors            | 1                | id                           | text                        | NO          | null                                            |
| storage      | buckets_vectors            | 2                | type                         | USER-DEFINED                | NO          | 'VECTOR'::storage.buckettype                    |
| storage      | buckets_vectors            | 3                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | buckets_vectors            | 4                | updated_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | migrations                 | 1                | id                           | integer                     | NO          | null                                            |
| storage      | migrations                 | 2                | name                         | character varying           | NO          | null                                            |
| storage      | migrations                 | 3                | hash                         | character varying           | NO          | null                                            |
| storage      | migrations                 | 4                | executed_at                  | timestamp without time zone | YES         | CURRENT_TIMESTAMP                               |
| storage      | objects                    | 1                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| storage      | objects                    | 2                | bucket_id                    | text                        | YES         | null                                            |
| storage      | objects                    | 3                | name                         | text                        | YES         | null                                            |
| storage      | objects                    | 4                | owner                        | uuid                        | YES         | null                                            |
| storage      | objects                    | 5                | created_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | objects                    | 6                | updated_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | objects                    | 7                | last_accessed_at             | timestamp with time zone    | YES         | now()                                           |
| storage      | objects                    | 8                | metadata                     | jsonb                       | YES         | null                                            |
| storage      | objects                    | 9                | path_tokens                  | ARRAY                       | YES         | null                                            |
| storage      | objects                    | 10               | version                      | text                        | YES         | null                                            |
| storage      | objects                    | 11               | owner_id                     | text                        | YES         | null                                            |
| storage      | objects                    | 12               | user_metadata                | jsonb                       | YES         | null                                            |
| storage      | objects                    | 13               | level                        | integer                     | YES         | null                                            |
| storage      | prefixes                   | 1                | bucket_id                    | text                        | NO          | null                                            |
| storage      | prefixes                   | 2                | name                         | text                        | NO          | null                                            |
| storage      | prefixes                   | 3                | level                        | integer                     | NO          | null                                            |
| storage      | prefixes                   | 4                | created_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | prefixes                   | 5                | updated_at                   | timestamp with time zone    | YES         | now()                                           |
| storage      | s3_multipart_uploads       | 1                | id                           | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads       | 2                | in_progress_size             | bigint                      | NO          | 0                                               |
| storage      | s3_multipart_uploads       | 3                | upload_signature             | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads       | 4                | bucket_id                    | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads       | 5                | key                          | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads       | 6                | version                      | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads       | 7                | owner_id                     | text                        | YES         | null                                            |
| storage      | s3_multipart_uploads       | 8                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | s3_multipart_uploads       | 9                | user_metadata                | jsonb                       | YES         | null                                            |
| storage      | s3_multipart_uploads_parts | 1                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| storage      | s3_multipart_uploads_parts | 2                | upload_id                    | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 3                | size                         | bigint                      | NO          | 0                                               |
| storage      | s3_multipart_uploads_parts | 4                | part_number                  | integer                     | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 5                | bucket_id                    | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 6                | key                          | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 7                | etag                         | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 8                | owner_id                     | text                        | YES         | null                                            |
| storage      | s3_multipart_uploads_parts | 9                | version                      | text                        | NO          | null                                            |
| storage      | s3_multipart_uploads_parts | 10               | created_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | vector_indexes             | 1                | id                           | text                        | NO          | gen_random_uuid()                               |
| storage      | vector_indexes             | 2                | name                         | text                        | NO          | null                                            |
| storage      | vector_indexes             | 3                | bucket_id                    | text                        | NO          | null                                            |
| storage      | vector_indexes             | 4                | data_type                    | text                        | NO          | null                                            |
| storage      | vector_indexes             | 5                | dimension                    | integer                     | NO          | null                                            |
| storage      | vector_indexes             | 6                | distance_metric              | text                        | NO          | null                                            |
| storage      | vector_indexes             | 7                | metadata_configuration       | jsonb                       | YES         | null                                            |
| storage      | vector_indexes             | 8                | created_at                   | timestamp with time zone    | NO          | now()                                           |
| storage      | vector_indexes             | 9                | updated_at                   | timestamp with time zone    | NO          | now()                                           |
| vault        | secrets                    | 1                | id                           | uuid                        | NO          | gen_random_uuid()                               |
| vault        | secrets                    | 2                | name                         | text                        | YES         | null                                            |
| vault        | secrets                    | 3                | description                  | text                        | NO          | ''::text                                        |
| vault        | secrets                    | 4                | secret                       | text                        | NO          | null                                            |
| vault        | secrets                    | 5                | key_id                       | uuid                        | YES         | null                                            |
| vault        | secrets                    | 6                | nonce                        | bytea                       | YES         | vault._crypto_aead_det_noncegen()               |
| vault        | secrets                    | 7                | created_at                   | timestamp with time zone    | NO          | CURRENT_TIMESTAMP                               |
| vault        | secrets                    | 8                | updated_at                   | timestamp with time zone    | NO          | CURRENT_TIMESTAMP                               |
