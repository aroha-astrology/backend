DELETE FROM reports WHERE user_id = (SELECT id FROM users WHERE phone = '+919535960988') AND report_key = 'marriage';
