-- =============================================
-- Ticket System - SQLite Schema
-- =============================================

-- YETKI (Rol)
CREATE TABLE IF NOT EXISTS yetki (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
INSERT OR IGNORE INTO yetki (id, name) VALUES (1, 'admin');
INSERT OR IGNORE INTO yetki (id, name) VALUES (2, 'agent');
INSERT OR IGNORE INTO yetki (id, name) VALUES (3, 'customer');

-- TICKET STATUS
CREATE TABLE IF NOT EXISTS ticket_status (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_closed INTEGER DEFAULT 0,
    order_no INTEGER
);
INSERT OR IGNORE INTO ticket_status (id, name, is_closed, order_no) VALUES (1, 'new', 0, 1);
INSERT OR IGNORE INTO ticket_status (id, name, is_closed, order_no) VALUES (2, 'in_progress', 0, 2);
INSERT OR IGNORE INTO ticket_status (id, name, is_closed, order_no) VALUES (3, 'waiting', 0, 3);
INSERT OR IGNORE INTO ticket_status (id, name, is_closed, order_no) VALUES (4, 'pending_close', 0, 4);
INSERT OR IGNORE INTO ticket_status (id, name, is_closed, order_no) VALUES (5, 'closed', 1, 5);

-- PRIORITY
CREATE TABLE IF NOT EXISTS ticket_priority (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    level INTEGER
);
INSERT OR IGNORE INTO ticket_priority (id, name, level) VALUES (1, 'low', 1);
INSERT OR IGNORE INTO ticket_priority (id, name, level) VALUES (2, 'medium', 2);
INSERT OR IGNORE INTO ticket_priority (id, name, level) VALUES (3, 'high', 3);
INSERT OR IGNORE INTO ticket_priority (id, name, level) VALUES (4, 'critical', 4);

-- ENTITY TYPE
CREATE TABLE IF NOT EXISTS entity_type (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
INSERT OR IGNORE INTO entity_type (id, name) VALUES (1, 'user');
INSERT OR IGNORE INTO entity_type (id, name) VALUES (2, 'firm');
INSERT OR IGNORE INTO entity_type (id, name) VALUES (3, 'ticket');

-- EVENT TYPE
CREATE TABLE IF NOT EXISTS event_type (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);
INSERT OR IGNORE INTO event_type (id, name) VALUES (1, 'create');
INSERT OR IGNORE INTO event_type (id, name) VALUES (2, 'update');
INSERT OR IGNORE INTO event_type (id, name) VALUES (3, 'assign');
INSERT OR IGNORE INTO event_type (id, name) VALUES (4, 'close');
INSERT OR IGNORE INTO event_type (id, name) VALUES (5, 'status_change');
INSERT OR IGNORE INTO event_type (id, name) VALUES (6, 'priority_change');
INSERT OR IGNORE INTO event_type (id, name) VALUES (7, 'tag_add');
INSERT OR IGNORE INTO event_type (id, name) VALUES (8, 'tag_remove');
INSERT OR IGNORE INTO event_type (id, name) VALUES (9, 'comment_add');
INSERT OR IGNORE INTO event_type (id, name) VALUES (10, 'reopen');
INSERT OR IGNORE INTO event_type (id, name) VALUES (11, 'unassign');

-- FIRM
CREATE TABLE IF NOT EXISTS firm (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    inactive INTEGER DEFAULT 0
);

-- USER
CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    mail TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    tel TEXT,
    firm_id INTEGER,
    yetki_id INTEGER DEFAULT 3,
    FOREIGN KEY (firm_id) REFERENCES firm(id),
    FOREIGN KEY (yetki_id) REFERENCES yetki(id)
);

-- TAG
CREATE TABLE IF NOT EXISTS tag (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    color_hex TEXT DEFAULT '#6b7280'
);

-- TICKET
CREATE TABLE IF NOT EXISTS ticket (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    firm_id INTEGER,
    created_by INTEGER,
    assigned_user_id INTEGER,
    status_id INTEGER DEFAULT 1,
    priority_id INTEGER DEFAULT 2,
    due_date TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (firm_id) REFERENCES firm(id),
    FOREIGN KEY (created_by) REFERENCES user(id),
    FOREIGN KEY (assigned_user_id) REFERENCES user(id),
    FOREIGN KEY (status_id) REFERENCES ticket_status(id),
    FOREIGN KEY (priority_id) REFERENCES ticket_priority(id)
);

-- TICKET TAG
CREATE TABLE IF NOT EXISTS ticket_tag (
    ticket_id INTEGER,
    tag_id INTEGER,
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    removed_at TEXT,
    removed_by INTEGER,
    PRIMARY KEY (ticket_id, tag_id),
    FOREIGN KEY (ticket_id) REFERENCES ticket(id),
    FOREIGN KEY (tag_id) REFERENCES tag(id),
    FOREIGN KEY (created_by) REFERENCES user(id)
);

-- EVENT LOG
CREATE TABLE IF NOT EXISTS event_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    entity_type_id INTEGER,
    entity_id INTEGER,
    event_type_id INTEGER,
    description TEXT,
    created_by INTEGER,
    old_value TEXT,
    new_value TEXT,
    FOREIGN KEY (entity_type_id) REFERENCES entity_type(id),
    FOREIGN KEY (event_type_id) REFERENCES event_type(id),
    FOREIGN KEY (created_by) REFERENCES user(id)
);
