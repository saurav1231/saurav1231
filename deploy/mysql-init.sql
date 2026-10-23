-- Runs once when the local Docker MySQL starts for the first time.
-- Lets the app user create the separate test database used by `pytest`.
CREATE DATABASE IF NOT EXISTS ayana_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON ayana_test.* TO 'ayana'@'%';
