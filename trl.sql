-- Create the users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    ulid CHAR(26) NOT NULL UNIQUE,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert seed data into the users table
-- INSERT INTO users (first_name, last_name, email, password, ulid)
-- VALUES 
-- ('John', 'Doe', 'john.doe@example.com', 'hashed_password_1', '01ARZ3NDEKTSV4RRFFQ69G5FAV'),
-- ('Jane', 'Smith', 'jane.smith@example.com', 'hashed_password_2', '01ARZ3NDEKTSV4RRFFQ69G5FBW');

-- Create the password_reset_tokens table
CREATE TABLE password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INT NOT NULL,
    token VARCHAR(255) NOT NULL,
    otp VARCHAR(10) NOT NULL,
    expired_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Insert seed data into the password_reset_tokens table
-- INSERT INTO password_reset_tokens (user_id, token, otp, expires_at)
-- VALUES
-- (1, 'reset_token_1', '123456', NOW() + INTERVAL '1 hour'),
-- (2, 'reset_token_2', '654321', NOW() + INTERVAL '1 hour');

-- Create indexes for faster queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
