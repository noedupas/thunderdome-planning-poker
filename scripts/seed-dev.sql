-- =============================================================================
-- Thunderdome : données de seed pour le développement local
-- =============================================================================
--
-- Crée un jeu de données complet pour tester l'app à la main : utilisateurs,
-- organisation / département / équipes, parties de poker, rétros, storyboard,
-- check-ins, kudos, alertes, tickets de support, projets.
--
-- Prérequis : la base doit être migrée (avoir lancé l'app au moins une fois).
--
-- Lancement : task seed-dev
--   ou :      docker compose cp scripts/seed-dev.sql db:/tmp/seed-dev.sql
--             docker compose exec -T db psql -U thor -d thunderdome -v ON_ERROR_STOP=1 -f /tmp/seed-dev.sql
--
-- Idempotent : le script supprime d'abord tout ce qu'il a créé lors d'un run
-- précédent (utilisateurs @thunderdome.local, organisation "Acme Corp", etc.)
-- puis recrée tout. Les autres données de la base ne sont pas touchées.
--
-- Comptes (mot de passe pour tous : kentRules!)
--   admin@thunderdome.local  ADMIN de l'application
--   alice@thunderdome.local  admin de l'organisation Acme Corp, admin équipe Alpha
--   bob@thunderdome.local    admin du département Engineering, membre Alpha
--   carol@thunderdome.local  membre Alpha, admin de l'équipe "Side Project"
--   dave@thunderdome.local   admin de l'équipe Beta
--   eve@thunderdome.local    inscrite mais email non vérifié, sans équipe
--   frank@thunderdome.local  compte désactivé
-- =============================================================================

\set ON_ERROR_STOP on

BEGIN;

-- -----------------------------------------------------------------------------
-- Nettoyage du run précédent
-- -----------------------------------------------------------------------------
DELETE FROM thunderdome.organization WHERE name = 'Acme Corp';            -- cascade : départements, équipes, projets, échelles, templates
DELETE FROM thunderdome.team WHERE name = 'Side Project' AND organization_id IS NULL;
DELETE FROM thunderdome.support_ticket WHERE email LIKE '%@thunderdome.local';
DELETE FROM thunderdome.alert WHERE name LIKE '[seed]%';
DELETE FROM thunderdome.users WHERE email LIKE '%@thunderdome.local';    -- cascade : parties, rétros, storyboards, check-ins…
DELETE FROM thunderdome.users WHERE type = 'GUEST' AND name = 'Gary (invité)';

-- -----------------------------------------------------------------------------
-- Helper : crée un utilisateur avec mot de passe "kentRules!"
-- -----------------------------------------------------------------------------
CREATE FUNCTION pg_temp.seed_user(
    p_name text, p_email text, p_type text, p_verified boolean,
    p_country text, p_company text, p_job_title text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
    v_id uuid;
BEGIN
    INSERT INTO thunderdome.users (name, email, type, verified, country, company, job_title)
    VALUES (p_name, p_email, p_type, p_verified, p_country, p_company, p_job_title)
    RETURNING id INTO v_id;

    -- bcrypt de "kentRules!" (même hash que les fixtures e2e)
    INSERT INTO thunderdome.auth_credential (user_id, email, password, verified)
    VALUES (v_id, p_email, '$2a$10$3CvuzyoGIme3dJ4v9BnvyOIKFxEaYyjV2Lfunykv0VokGf/twxi9m', p_verified);

    RETURN v_id;
END
$fn$;

DO $seed$
DECLARE
    -- utilisateurs
    u_admin uuid; u_alice uuid; u_bob uuid; u_carol uuid; u_dave uuid; u_eve uuid; u_frank uuid; u_guest uuid;
    -- structure
    v_org uuid; v_dept uuid; t_alpha uuid; t_beta uuid; t_side uuid;
    -- référentiels existants (créés par les migrations)
    v_scale_default uuid; v_scale_default_values text[];
    v_scale_tshirt uuid;  v_scale_tshirt_values text[];
    v_tpl_default uuid; v_tpl_msg uuid;
    -- poker
    p_sprint42 uuid; p_backlog uuid; p_sprint41 uuid; s_active uuid;
    -- rétro
    r_done uuid; r_brainstorm uuid; r_beta uuid;
    g_comm uuid; g_tmp uuid; i_tmp uuid; a_tmp uuid;
    -- storyboard
    sb uuid; pe_new uuid; pe_admin uuid;
    go_discover uuid; go_activate uuid;
    c_signup uuid; c_firstgame uuid; c_invite uuid; c_firstretro uuid;
    st_tmp uuid;
    -- check-ins
    v_day date; v_idx int := 0; ci_tmp uuid;
    -- projets
    pr_team uuid;
BEGIN
    -- =========================================================================
    -- Utilisateurs
    -- =========================================================================
    u_admin := pg_temp.seed_user('Admin Dev',    'admin@thunderdome.local', 'ADMIN',      true,  'CH', 'Thunderdome', 'Administrateur');
    u_alice := pg_temp.seed_user('Alice Martin', 'alice@thunderdome.local', 'REGISTERED', true,  'CH', 'Acme Corp',   'Product Owner');
    u_bob   := pg_temp.seed_user('Bob Dupont',   'bob@thunderdome.local',   'REGISTERED', true,  'FR', 'Acme Corp',   'Tech Lead');
    u_carol := pg_temp.seed_user('Carol Rossi',  'carol@thunderdome.local', 'REGISTERED', true,  'IT', 'Acme Corp',   'Développeuse');
    u_dave  := pg_temp.seed_user('Dave Müller',  'dave@thunderdome.local',  'REGISTERED', true,  'DE', 'Acme Corp',   'Scrum Master');
    u_eve   := pg_temp.seed_user('Eve Leroy',    'eve@thunderdome.local',   'REGISTERED', false, 'BE', NULL,          NULL);
    u_frank := pg_temp.seed_user('Frank Blanc',  'frank@thunderdome.local', 'REGISTERED', true,  'CH', 'Ex-Acme',     'Ancien employé');
    UPDATE thunderdome.users SET disabled = true WHERE id = u_frank;

    -- invité (pas de credentials, comme un utilisateur "guest" créé via l'UI)
    INSERT INTO thunderdome.users (name, type) VALUES ('Gary (invité)', 'GUEST') RETURNING id INTO u_guest;

    -- =========================================================================
    -- Organisation, département, équipes
    -- =========================================================================
    INSERT INTO thunderdome.organization (name) VALUES ('Acme Corp') RETURNING id INTO v_org;
    INSERT INTO thunderdome.organization_user (organization_id, user_id, role) VALUES
        (v_org, u_alice, 'ADMIN'),
        (v_org, u_bob,   'MEMBER'),
        (v_org, u_carol, 'MEMBER'),
        (v_org, u_dave,  'MEMBER');

    INSERT INTO thunderdome.organization_department (organization_id, name)
    VALUES (v_org, 'Engineering') RETURNING id INTO v_dept;
    INSERT INTO thunderdome.department_user (department_id, user_id, role) VALUES
        (v_dept, u_bob,   'ADMIN'),
        (v_dept, u_carol, 'MEMBER');

    -- équipe de département
    INSERT INTO thunderdome.team (name, organization_id, department_id)
    VALUES ('Alpha', v_org, v_dept) RETURNING id INTO t_alpha;
    INSERT INTO thunderdome.team_user (team_id, user_id, role) VALUES
        (t_alpha, u_alice, 'ADMIN'),
        (t_alpha, u_bob,   'MEMBER'),
        (t_alpha, u_carol, 'MEMBER');

    -- équipe d'organisation (hors département)
    INSERT INTO thunderdome.team (name, organization_id)
    VALUES ('Beta', v_org) RETURNING id INTO t_beta;
    INSERT INTO thunderdome.team_user (team_id, user_id, role) VALUES
        (t_beta, u_dave,  'ADMIN'),
        (t_beta, u_alice, 'MEMBER');

    -- équipe hors organisation
    INSERT INTO thunderdome.team (name) VALUES ('Side Project') RETURNING id INTO t_side;
    INSERT INTO thunderdome.team_user (team_id, user_id, role) VALUES
        (t_side, u_carol, 'ADMIN'),
        (t_side, u_dave,  'MEMBER');

    -- invitation en attente (adresse sans compte → tester le flux d'invitation)
    INSERT INTO thunderdome.team_user_invite (team_id, email, role, expire_date)
    VALUES (t_alpha, 'newbie@thunderdome.local', 'MEMBER', now() + interval '7 days');

    -- =========================================================================
    -- Référentiels : échelles d'estimation et templates de rétro
    -- =========================================================================
    SELECT id, "values" INTO v_scale_default, v_scale_default_values
    FROM thunderdome.estimation_scale WHERE scale_type = 'thunderdome_default' AND is_public LIMIT 1;
    SELECT id, "values" INTO v_scale_tshirt, v_scale_tshirt_values
    FROM thunderdome.estimation_scale WHERE scale_type = 't_shirt' AND is_public LIMIT 1;

    SELECT id INTO v_tpl_default FROM thunderdome.retro_template WHERE is_public AND default_template LIMIT 1;
    SELECT id INTO v_tpl_msg     FROM thunderdome.retro_template WHERE is_public AND name = 'Mad/Sad/Glad' LIMIT 1;

    -- échelle personnalisée de l'organisation
    INSERT INTO thunderdome.estimation_scale (name, description, scale_type, "values", is_public, organization_id, created_by)
    VALUES ('Acme Heures', 'Estimation en heures pour les tâches de support', 'custom',
            ARRAY['1','2','4','8','16','24','?'], false, v_org, u_alice);

    -- template de rétro personnalisé de l'équipe Alpha
    INSERT INTO thunderdome.retro_template (name, description, format, is_public, created_by, team_id)
    VALUES ('Rose / Bourgeon / Épine', 'Ce qui va bien, ce qui émerge, ce qui pique',
            '{"columns": [{"name": "rose", "color": "green", "label": "Rose"},
                          {"name": "bud", "color": "blue", "label": "Bourgeon"},
                          {"name": "thorn", "color": "red", "label": "Épine"}]}'::jsonb,
            false, u_alice, t_alpha);

    -- =========================================================================
    -- Planning poker
    -- =========================================================================

    -- 1) Partie en cours : une story en vote, des stories déjà estimées, d'autres en attente
    INSERT INTO thunderdome.poker (owner_id, name, voting_locked, point_values_allowed, estimation_scale_id,
                                   auto_finish_voting, point_average_rounding, join_code, leader_code, team_id)
    VALUES (u_alice, 'Sprint 42 – Planning', false, v_scale_default_values, v_scale_default,
            false, 'ceil', '', '', t_alpha)
    RETURNING id INTO p_sprint42;

    INSERT INTO thunderdome.poker_facilitator (poker_id, user_id) VALUES (p_sprint42, u_alice), (p_sprint42, u_bob);
    INSERT INTO thunderdome.poker_user (poker_id, user_id, spectator) VALUES
        (p_sprint42, u_alice, false), (p_sprint42, u_bob, false),
        (p_sprint42, u_carol, false), (p_sprint42, u_guest, true);

    INSERT INTO thunderdome.poker_story (poker_id, position, name, type, reference_id, link, priority, description, acceptance_criteria, points, votes)
    VALUES
        (p_sprint42, 1, 'Connexion via SSO', 'story', 'ACME-101', 'https://example.com/ACME-101', 2,
         '<p>En tant qu''utilisateur, je veux me connecter avec le SSO de l''entreprise.</p>',
         '<ul><li>Bouton « Se connecter avec SSO »</li><li>Création du compte au premier login</li></ul>',
         '5', jsonb_build_array(
            jsonb_build_object('warriorId', u_alice, 'vote', '5'),
            jsonb_build_object('warriorId', u_bob,   'vote', '5'),
            jsonb_build_object('warriorId', u_carol, 'vote', '8'))),
        (p_sprint42, 2, 'Export CSV des rapports', 'story', 'ACME-102', NULL, 3,
         '<p>Pouvoir exporter les rapports mensuels en CSV.</p>', NULL,
         '3', jsonb_build_array(
            jsonb_build_object('warriorId', u_alice, 'vote', '3'),
            jsonb_build_object('warriorId', u_bob,   'vote', '3'),
            jsonb_build_object('warriorId', u_carol, 'vote', '2'))),
        (p_sprint42, 4, 'Notifications par email', 'story', 'ACME-104', NULL, 3,
         '<p>Envoyer un email quand une tâche est assignée.</p>', NULL, '', '[]'::jsonb),
        (p_sprint42, 5, 'Le tri des colonnes est perdu au rechargement', 'bug', 'ACME-105', NULL, 1,
         '<p>Le tri choisi dans le tableau n''est pas conservé.</p>', NULL, '', '[]'::jsonb);

    INSERT INTO thunderdome.poker_story (poker_id, position, name, type, reference_id, priority, description, skipped)
    VALUES (p_sprint42, 6, 'Spike : WebSocket vs Server-Sent Events', 'spike', 'ACME-106', 4,
            '<p>Évaluer les deux approches pour le temps réel.</p>', true);

    -- story active : vote ouvert, 2 votes sur 3 (Alice n'a pas encore voté)
    INSERT INTO thunderdome.poker_story (poker_id, position, name, type, reference_id, priority, description, active, votestart_time, votes)
    VALUES (p_sprint42, 3, 'Page de profil utilisateur', 'story', 'ACME-103', 2,
            '<p>Afficher et modifier nom, avatar et préférences.</p>', true, now() - interval '2 minutes',
            jsonb_build_array(
                jsonb_build_object('warriorId', u_bob,   'vote', '5'),
                jsonb_build_object('warriorId', u_carol, 'vote', '8')))
    RETURNING id INTO s_active;
    UPDATE thunderdome.poker SET active_story_id = s_active WHERE id = p_sprint42;

    -- 2) Partie personnelle (sans équipe), échelle T-shirt, pas encore démarrée
    INSERT INTO thunderdome.poker (owner_id, name, voting_locked, point_values_allowed, estimation_scale_id,
                                   auto_finish_voting, point_average_rounding, join_code, leader_code, hide_voter_identity)
    VALUES (u_bob, 'Estimation backlog Q4', true, v_scale_tshirt_values, v_scale_tshirt,
            true, 'ceil', '', '', true)
    RETURNING id INTO p_backlog;
    INSERT INTO thunderdome.poker_facilitator (poker_id, user_id) VALUES (p_backlog, u_bob);
    INSERT INTO thunderdome.poker_user (poker_id, user_id) VALUES (p_backlog, u_bob), (p_backlog, u_dave);
    INSERT INTO thunderdome.poker_story (poker_id, position, name, type, priority) VALUES
        (p_backlog, 1, 'Migration vers PostgreSQL 17', 'task', 2),
        (p_backlog, 2, 'Refonte du tableau de bord', 'epic', 3),
        (p_backlog, 3, 'Mode sombre', 'story', 4);

    -- 3) Partie terminée il y a deux semaines
    INSERT INTO thunderdome.poker (owner_id, name, voting_locked, point_values_allowed, estimation_scale_id,
                                   join_code, leader_code, team_id, created_date, updated_date, last_active, end_time, end_reason)
    VALUES (u_alice, 'Sprint 41 – Planning', true, v_scale_default_values, v_scale_default,
            '', '', t_alpha, now() - interval '15 days', now() - interval '14 days', now() - interval '14 days',
            now() - interval '14 days', 'completed')
    RETURNING id INTO p_sprint41;
    INSERT INTO thunderdome.poker_facilitator (poker_id, user_id) VALUES (p_sprint41, u_alice);
    INSERT INTO thunderdome.poker_user (poker_id, user_id) VALUES (p_sprint41, u_alice), (p_sprint41, u_bob), (p_sprint41, u_carol);
    INSERT INTO thunderdome.poker_story (poker_id, position, name, type, points, votes) VALUES
        (p_sprint41, 1, 'Page de connexion', 'story', '3', jsonb_build_array(
            jsonb_build_object('warriorId', u_alice, 'vote', '3'),
            jsonb_build_object('warriorId', u_bob,   'vote', '2'),
            jsonb_build_object('warriorId', u_carol, 'vote', '3'))),
        (p_sprint41, 2, 'Mot de passe oublié', 'story', '2', jsonb_build_array(
            jsonb_build_object('warriorId', u_alice, 'vote', '2'),
            jsonb_build_object('warriorId', u_bob,   'vote', '2'),
            jsonb_build_object('warriorId', u_carol, 'vote', '1'))),
        (p_sprint41, 3, 'Gestion des rôles', 'story', '8', jsonb_build_array(
            jsonb_build_object('warriorId', u_alice, 'vote', '8'),
            jsonb_build_object('warriorId', u_bob,   'vote', '13'),
            jsonb_build_object('warriorId', u_carol, 'vote', '8')));
    -- triggers last_active : on remet la date de fin
    UPDATE thunderdome.poker SET last_active = now() - interval '14 days' WHERE id = p_sprint41;

    -- =========================================================================
    -- Rétrospectives
    -- =========================================================================

    -- 1) Rétro terminée : items groupés, votes, actions
    INSERT INTO thunderdome.retro (owner_id, name, phase, join_code, facilitator_code, team_id, template_id,
                                   max_votes, brainstorm_visibility, created_date)
    VALUES (u_alice, 'Rétro Sprint 41', 'completed', '', '', t_alpha, v_tpl_default,
            3, 'visible', now() - interval '13 days')
    RETURNING id INTO r_done;
    INSERT INTO thunderdome.retro_facilitator (retro_id, user_id) VALUES (r_done, u_alice);
    INSERT INTO thunderdome.retro_user (retro_id, user_id) VALUES (r_done, u_alice), (r_done, u_bob), (r_done, u_carol);

    -- groupe nommé avec deux items
    INSERT INTO thunderdome.retro_group (retro_id, name) VALUES (r_done, 'Communication') RETURNING id INTO g_comm;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content) VALUES
        (r_done, g_comm, u_bob,   'improve', 'Les specs arrivent trop tard dans le sprint'),
        (r_done, g_comm, u_carol, 'improve', 'Pas assez d''échanges avec le design');
    INSERT INTO thunderdome.retro_group_vote (retro_id, group_id, user_id, vote_count) VALUES
        (r_done, g_comm, u_alice, 1), (r_done, g_comm, u_bob, 1), (r_done, g_comm, u_carol, 1);

    -- items seuls (un groupe par item, comme le fait l'app)
    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_done) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_done, g_tmp, u_alice, 'worked', 'Super entraide sur le bug de production') RETURNING id INTO i_tmp;
    INSERT INTO thunderdome.retro_group_vote (retro_id, group_id, user_id) VALUES (r_done, g_tmp, u_bob);
    INSERT INTO thunderdome.retro_item_comment (item_id, user_id, comment) VALUES (i_tmp, u_carol, 'Merci à Bob pour le pairing !');
    INSERT INTO thunderdome.retro_item_reaction (item_id, user_id, reaction) VALUES
        (i_tmp, u_bob, '🎉'), (i_tmp, u_carol, '👍');

    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_done) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_done, g_tmp, u_carol, 'worked', 'La CI est beaucoup plus rapide');

    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_done) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_done, g_tmp, u_bob, 'question', 'Quand passe-t-on à la nouvelle version de l''API ?');
    INSERT INTO thunderdome.retro_group_vote (retro_id, group_id, user_id) VALUES (r_done, g_tmp, u_alice);

    INSERT INTO thunderdome.retro_action (retro_id, content, completed)
    VALUES (r_done, 'Organiser un refinement avec le design chaque mardi', false) RETURNING id INTO a_tmp;
    INSERT INTO thunderdome.retro_action_assignee (action_id, user_id) VALUES (a_tmp, u_alice), (a_tmp, u_carol);
    INSERT INTO thunderdome.retro_action_comment (action_id, user_id, comment) VALUES (a_tmp, u_alice, 'Invitation envoyée');

    INSERT INTO thunderdome.retro_action (retro_id, content, completed)
    VALUES (r_done, 'Documenter la procédure de mise en production', true) RETURNING id INTO a_tmp;
    INSERT INTO thunderdome.retro_action_assignee (action_id, user_id) VALUES (a_tmp, u_bob);

    INSERT INTO thunderdome.retro_action (retro_id, content) VALUES (r_done, 'Planifier la migration de l''API v2');

    -- 2) Rétro en phase brainstorm
    INSERT INTO thunderdome.retro (owner_id, name, phase, join_code, facilitator_code, team_id, template_id,
                                   max_votes, brainstorm_visibility, phase_time_start)
    VALUES (u_alice, 'Rétro Sprint 42', 'brainstorm', '', '', t_alpha, v_tpl_default, 3, 'visible', now())
    RETURNING id INTO r_brainstorm;
    INSERT INTO thunderdome.retro_facilitator (retro_id, user_id) VALUES (r_brainstorm, u_alice);
    INSERT INTO thunderdome.retro_user (retro_id, user_id) VALUES (r_brainstorm, u_alice), (r_brainstorm, u_bob), (r_brainstorm, u_carol);

    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_brainstorm) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_brainstorm, g_tmp, u_bob, 'worked', 'Le SSO est livré !');
    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_brainstorm) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_brainstorm, g_tmp, u_carol, 'improve', 'Trop de réunions cette semaine');
    INSERT INTO thunderdome.retro_group (retro_id) VALUES (r_brainstorm) RETURNING id INTO g_tmp;
    INSERT INTO thunderdome.retro_item (retro_id, group_id, user_id, type, content)
    VALUES (r_brainstorm, g_tmp, u_carol, 'question', 'Qui reprend le support pendant les vacances ?');

    -- 3) Rétro pas encore démarrée, template Mad/Sad/Glad, équipe Beta
    INSERT INTO thunderdome.retro (owner_id, name, phase, join_code, facilitator_code, team_id, template_id, max_votes)
    VALUES (u_dave, 'Rétro équipe Beta', 'intro', '', '', t_beta, COALESCE(v_tpl_msg, v_tpl_default), 5)
    RETURNING id INTO r_beta;
    INSERT INTO thunderdome.retro_facilitator (retro_id, user_id) VALUES (r_beta, u_dave);
    INSERT INTO thunderdome.retro_user (retro_id, user_id) VALUES (r_beta, u_dave);

    -- =========================================================================
    -- Storyboard
    -- =========================================================================
    INSERT INTO thunderdome.storyboard (owner_id, name, join_code, facilitator_code, team_id)
    VALUES (u_alice, 'Refonte de l''onboarding', '', '', t_alpha) RETURNING id INTO sb;
    INSERT INTO thunderdome.storyboard_facilitator (storyboard_id, user_id) VALUES (sb, u_alice);
    INSERT INTO thunderdome.storyboard_user (storyboard_id, user_id) VALUES (sb, u_alice), (sb, u_bob), (sb, u_carol);

    INSERT INTO thunderdome.storyboard_persona (storyboard_id, name, role, description)
    VALUES (sb, 'Nina', 'Nouvelle utilisatrice', 'Découvre l''outil, veut lancer une partie rapidement')
    RETURNING id INTO pe_new;
    INSERT INTO thunderdome.storyboard_persona (storyboard_id, name, role, description)
    VALUES (sb, 'Marc', 'Admin d''équipe', 'Gère les membres et les réglages de son équipe')
    RETURNING id INTO pe_admin;

    -- display_order : clés d'index fractionnaire ("a1" < "a2" < …), comme internal/fracindex
    INSERT INTO thunderdome.storyboard_goal (storyboard_id, name, display_order)
    VALUES (sb, 'Découverte', 'a1') RETURNING id INTO go_discover;
    INSERT INTO thunderdome.storyboard_goal (storyboard_id, name, display_order, default_story_color)
    VALUES (sb, 'Activation', 'a2', 'green') RETURNING id INTO go_activate;
    INSERT INTO thunderdome.storyboard_goal_persona (goal_id, persona_id) VALUES (go_discover, pe_new);

    INSERT INTO thunderdome.storyboard_column (storyboard_id, goal_id, name, display_order)
    VALUES (sb, go_discover, 'Inscription', 'a1') RETURNING id INTO c_signup;
    INSERT INTO thunderdome.storyboard_column (storyboard_id, goal_id, name, display_order)
    VALUES (sb, go_discover, 'Première partie', 'a2') RETURNING id INTO c_firstgame;
    INSERT INTO thunderdome.storyboard_column (storyboard_id, goal_id, name, display_order)
    VALUES (sb, go_activate, 'Inviter l''équipe', 'a1') RETURNING id INTO c_invite;
    INSERT INTO thunderdome.storyboard_column (storyboard_id, goal_id, name, display_order)
    VALUES (sb, go_activate, 'Première rétro', 'a2') RETURNING id INTO c_firstretro;
    INSERT INTO thunderdome.storyboard_column_persona (column_id, persona_id) VALUES (c_invite, pe_admin);

    INSERT INTO thunderdome.storyboard_story (storyboard_id, goal_id, column_id, name, content, color, points, closed, display_order)
    VALUES (sb, go_discover, c_signup, 'Formulaire d''inscription simplifié', '<p>Nom, email, mot de passe uniquement.</p>', 'blue', '3', true, 'a1')
    RETURNING id INTO st_tmp;
    INSERT INTO thunderdome.storyboard_story_comment (storyboard_id, story_id, user_id, comment)
    VALUES (sb, st_tmp, u_bob, 'Livré au sprint 40');

    INSERT INTO thunderdome.storyboard_story (storyboard_id, goal_id, column_id, name, content, color, points, display_order) VALUES
        (sb, go_discover, c_signup,     'Connexion Google / SSO',       '<p>Réduire la friction à l''inscription.</p>', 'blue',   '5', 'a2'),
        (sb, go_discover, c_firstgame,  'Tutoriel interactif',          '<p>Guide pas à pas pour la première partie.</p>', 'yellow', '8', 'a1'),
        (sb, go_discover, c_firstgame,  'Partie de démo pré-remplie',   NULL, 'orange', '3', 'a2'),
        (sb, go_activate, c_invite,     'Lien d''invitation partageable', NULL, 'green', '2', 'a1'),
        (sb, go_activate, c_invite,     'Import des membres depuis CSV', NULL, 'red',   '5', 'a2'),
        (sb, go_activate, c_firstretro, 'Template de rétro recommandé', NULL, 'purple', '1', 'a1');

    -- =========================================================================
    -- Check-ins d'équipe (Alpha) : 5 derniers jours ouvrés + aujourd'hui
    -- =========================================================================
    FOR v_day IN
        SELECT d::date FROM generate_series(current_date - 7, current_date - 1, interval '1 day') d
        WHERE extract(isodow FROM d) < 6
        ORDER BY d
    LOOP
        v_idx := v_idx + 1;
        INSERT INTO thunderdome.team_checkin (team_id, user_id, checkin_date, created_date, yesterday, today, blockers, discuss, goals_met)
        VALUES
            (t_alpha, u_alice, v_day, v_day + time '09:05',
             '<p>Revue du backlog avec les stakeholders</p>', '<p>Préparer le sprint planning</p>', NULL, NULL, true),
            (t_alpha, u_bob, v_day, v_day + time '09:10',
             '<p>Implémentation du SSO</p>', '<p>Tests d''intégration du SSO</p>',
             CASE WHEN v_idx % 3 = 0 THEN '<p>En attente des accès à l''environnement de recette</p>' END,
             NULL, v_idx % 3 <> 0),
            (t_alpha, u_carol, v_day, v_day + time '09:20',
             '<p>Correction de bugs sur l''export CSV</p>', '<p>Page de profil utilisateur</p>', NULL,
             CASE WHEN v_idx = 2 THEN '<p>Faut-il supporter Safari 15 ?</p>' END, true);
    END LOOP;

    -- aujourd'hui : Bob et Carol ont fait leur check-in, Alice non (pour tester la création)
    INSERT INTO thunderdome.team_checkin (team_id, user_id, yesterday, today, blockers, goals_met)
    VALUES (t_alpha, u_bob, '<p>Tests d''intégration du SSO</p>', '<p>Mise en recette du SSO</p>',
            '<p>La recette est instable depuis ce matin</p>', false)
    RETURNING id INTO ci_tmp;
    INSERT INTO thunderdome.team_checkin_comment (checkin_id, user_id, comment)
    VALUES (ci_tmp, u_alice, 'Je relance l''équipe infra');
    INSERT INTO thunderdome.team_checkin (team_id, user_id, yesterday, today, goals_met)
    VALUES (t_alpha, u_carol, '<p>Page de profil utilisateur</p>', '<p>Finaliser la page de profil</p>', true);

    INSERT INTO thunderdome.team_kudos (team_id, user_id, target_user_id, comment, kudos_date) VALUES
        (t_alpha, u_bob,   u_carol, 'Merci pour l''aide sur l''export CSV !', current_date - 1),
        (t_alpha, u_alice, u_bob,   'Bravo pour la livraison du SSO', current_date);

    -- =========================================================================
    -- Projets (fonctionnalité expérimentale : FEATURE_PROJECT=true pour les voir)
    -- =========================================================================
    INSERT INTO thunderdome.project (project_key, name, description, organization_id)
    VALUES ('ACME', 'Plateforme Acme', 'Projet transverse de l''organisation', v_org);
    INSERT INTO thunderdome.project (project_key, name, description, team_id)
    VALUES ('ALPHA', 'Produit Alpha', 'Projet de l''équipe Alpha', t_alpha)
    RETURNING id INTO pr_team;
    INSERT INTO thunderdome.project_user (project_id, user_id, role) VALUES (pr_team, u_alice, 'ADMIN'), (pr_team, u_bob, 'MEMBER');
    INSERT INTO thunderdome.project_poker (project_id, poker_id) VALUES (pr_team, p_sprint42), (pr_team, p_sprint41);
    INSERT INTO thunderdome.project_retro (project_id, retro_id) VALUES (pr_team, r_done);
    INSERT INTO thunderdome.project_storyboard (project_id, storyboard_id) VALUES (pr_team, sb);

    -- =========================================================================
    -- Administration : alerte globale, tickets de support
    -- =========================================================================
    INSERT INTO thunderdome.alert (name, type, content, active, allow_dismiss, registered_only)
    VALUES ('[seed] Bienvenue', 'NEW', 'Environnement de développement : données de test chargées par scripts/seed-dev.sql',
            true, true, false);

    INSERT INTO thunderdome.support_ticket (user_id, full_name, email, inquiry)
    VALUES (u_carol, 'Carol Rossi', 'carol@thunderdome.local', 'L''import Jira échoue avec une erreur 500.');
    INSERT INTO thunderdome.support_ticket (user_id, full_name, email, inquiry, assigned_to, notes, resolved_at, resolved_by)
    VALUES (u_eve, 'Eve Leroy', 'eve@thunderdome.local', 'Je n''ai pas reçu l''email de vérification.',
            u_admin, 'Email renvoyé manuellement.', now() - interval '1 day', u_admin);

    RAISE NOTICE 'Seed terminé : 7 comptes @thunderdome.local (mot de passe kentRules!), organisation Acme Corp, 3 parties, 3 rétros, 1 storyboard.';
END
$seed$;

COMMIT;
