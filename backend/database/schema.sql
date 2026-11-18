CREATE DATABASE IF NOT EXISTS smart_campus_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE smart_campus_db;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(50) UNIQUE NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('student', 'organizer', 'coordinator', 'admin') NOT NULL DEFAULT 'student',
  department VARCHAR(100) NULL,
  academic_year TINYINT UNSIGNED NULL,
  status ENUM('active', 'suspended') NOT NULL DEFAULT 'active',
  staff_verified BOOLEAN NOT NULL DEFAULT FALSE,
  must_change_password BOOLEAN NOT NULL DEFAULT FALSE,
  credential_version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  location VARCHAR(150),
  event_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  registration_deadline DATETIME NULL,
  capacity INT NULL,
  department VARCHAR(100) NULL,
  target_year TINYINT UNSIGNED NULL,
  status ENUM('draft','pending_approval','approved','rejected','revision_requested','published','cancelled','completed') NOT NULL DEFAULT 'published',
  approved_by INT NULL,
  approved_at DATETIME NULL,
  rejection_reason TEXT NULL,
  created_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_creator FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_events_date (event_date),
  INDEX idx_events_category (category)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  event_id INT NOT NULL,
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('registered','cancelled') NOT NULL DEFAULT 'registered',
  cancelled_at DATETIME NULL,
  attendance_status ENUM('pending','present','absent') NOT NULL DEFAULT 'pending',
  checked_in_at DATETIME NULL,
  checked_in_by INT NULL,
  UNIQUE KEY uq_student_event (student_id, event_id),
  CONSTRAINT fk_registration_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_registration_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS event_feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  event_id INT NOT NULL,
  student_id INT NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  comments TEXT NULL,
  UNIQUE KEY uq_event_feedback_student (event_id, student_id),
  CONSTRAINT fk_feedback_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS staff_invitations (
  user_id INT NOT NULL PRIMARY KEY,
  token_hash BINARY(32) NOT NULL UNIQUE,
  issued_at DATETIME NOT NULL,
  expires_at DATETIME NOT NULL,
  delivery_status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  CONSTRAINT fk_staff_invitation_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
