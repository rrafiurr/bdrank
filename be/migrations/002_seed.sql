USE `review-new`;

-- ── Users ────────────────────────────────────────────────────────────────────
-- passwords are bcrypt of "password123"
INSERT INTO users (email, password_hash, full_name, username, bio, avatar_url) VALUES
('alice@example.com',  '$2b$10$deh0EFbPVJHusmTwv1/yf.XPeY8d7OoNnBUA88G42l0XZzVNA5Lzu', 'Alice Johnson',  'alice',   'Tech reviewer & gadget lover',         'https://i.pravatar.cc/150?u=alice'),
('bob@example.com',    '$2b$10$deh0EFbPVJHusmTwv1/yf.XPeY8d7OoNnBUA88G42l0XZzVNA5Lzu', 'Bob Smith',      'bob',     'Software engineer, coffee addict',     'https://i.pravatar.cc/150?u=bob'),
('carol@example.com',  '$2b$10$deh0EFbPVJHusmTwv1/yf.XPeY8d7OoNnBUA88G42l0XZzVNA5Lzu', 'Carol White',    'carol',   'Digital nomad and SaaS enthusiast',    'https://i.pravatar.cc/150?u=carol'),
('dave@example.com',   '$2b$10$deh0EFbPVJHusmTwv1/yf.XPeY8d7OoNnBUA88G42l0XZzVNA5Lzu', 'Dave Brown',     'dave',    'Hardware hacker and DIY tinkerer',     'https://i.pravatar.cc/150?u=dave'),
('eva@example.com',    '$2b$10$deh0EFbPVJHusmTwv1/yf.XPeY8d7OoNnBUA88G42l0XZzVNA5Lzu', 'Eva Martinez',   'eva',     'Freelance designer, app reviewer',     'https://i.pravatar.cc/150?u=eva');

-- ── Products ─────────────────────────────────────────────────────────────────
INSERT INTO products (name, category, image_url) VALUES
('Sony WH-1000XM5',           'physical', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400'),
('Apple MacBook Pro 14"',     'physical', 'https://images.unsplash.com/photo-1611186871525-9be1ea36c6cb?w=400'),
('Notion',                    'digital',  'https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?w=400'),
('Figma',                     'digital',  'https://images.unsplash.com/photo-1609921212029-bb5a28e60960?w=400'),
('AWS Lambda',                'service',  'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400'),
('Logitech MX Master 3S',     'physical', 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400'),
('GitHub Copilot',            'service',  'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=400'),
('Obsidian',                  'digital',  'https://images.unsplash.com/photo-1512314889357-e157c22f938d?w=400'),
('Vercel',                    'service',  'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=400'),
('Keychron K2 Keyboard',      'physical', 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=400');

-- ── Reviews ──────────────────────────────────────────────────────────────────
INSERT INTO reviews (user_id, product_id, title, content, rating) VALUES
(1, 1, 'Best noise-cancelling headphones I have owned',
 'After two weeks of daily use during remote work and commuting, these headphones continue to impress. The ANC is the best I have experienced — it nearly eliminates the low-frequency hum of my AC unit and muffles keyboard clatter in coffee shops. Sound quality is warm without being muddy; bass is present but not overwhelming. Battery life easily stretches 28–30 hours in my usage.',
 5),
(2, 2, 'Incredible performance, questionable price',
 'The M3 Pro chip handles every development workload I throw at it without breaking a sweat. Compiling large Rust projects, running multiple Docker containers, and editing 4K video simultaneously — the machine stays cool and quiet. My only complaint is the notch and the premium Apple charges for RAM upgrades.',
 4),
(3, 3, 'Notion replaced four other apps for me',
 'I was skeptical of the hype, but after two months I have consolidated my task manager, wiki, project tracker, and journal into one workspace. The learning curve is real — expect to spend a weekend building your system. Once you do, the flexibility is unmatched.',
 5),
(1, 6, 'The last mouse I will ever buy',
 'I switched from a basic Logitech G305 and the ergonomic difference is night and day after long coding sessions. The scroll wheel with SmartShift is genuinely useful: fast scrolling for long pages, precise ratchet for code navigation. Bluetooth multi-device pairing works flawlessly between my MacBook and PC.',
 5),
(4, 7, 'GitHub Copilot: six months in',
 'Copilot has become a genuine pair programmer rather than a glorified autocomplete. For boilerplate — CRUD handlers, test stubs, regex patterns — it saves minutes per hour. It occasionally suggests deprecated APIs or subtly wrong logic, so treat it as a fast first draft, not ground truth.',
 4),
(5, 4, 'Figma is now essential to my workflow',
 'As a solo designer who collaborates with remote developers, Figma eliminated the file-version chaos that plagued my Sketch days. The developer handoff with inspect mode is seamless. Auto-layout took a week to internalise but now I build components faster than ever.',
 5),
(2, 5, 'AWS Lambda: powerful but surprisingly complex',
 'Lambda is genuinely useful for event-driven workloads and I run several production functions. Cold starts on the Node.js runtime are acceptable; cold starts on Java are still painful unless you use SnapStart. The operational complexity of wiring up IAM roles, VPCs, and monitoring is non-trivial.',
 3),
(3, 8, 'Obsidian is the best knowledge base for developers',
 'Obsidian stores everything as plain Markdown files, which means no vendor lock-in and full Git version control. The graph view is more useful than I expected for spotting conceptual clusters. The plugin ecosystem is extraordinary — dataview alone turns your vault into a local database.',
 5),
(4, 9, 'Vercel makes deployment feel effortless',
 'Push to GitHub, deployment is live in 30 seconds, preview URLs for every PR, zero-config CDN, and built-in analytics. For Next.js projects it is the obvious choice. Pricing can escalate for high-traffic sites, but the developer experience justifies it at every tier.',
 4),
(5, 10, 'Keychron K2 — my daily driver for a year',
 'After a year of daily typing on the Gateron Brown switches, my hands thank me. The compact 75% layout keeps the arrow keys without taking over my desk. Build quality is solid; the aluminium frame dampens flex. The keycaps have held up with zero legends fading.',
 4);

-- ── Review images ─────────────────────────────────────────────────────────────
INSERT INTO review_images (review_id, url) VALUES
(1, 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=800'),
(2, 'https://images.unsplash.com/photo-1611186871525-9be1ea36c6cb?w=800'),
(2, 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=800'),
(4, 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=800'),
(6, 'https://images.unsplash.com/photo-1609921212029-bb5a28e60960?w=800');

-- ── Timeline entries (review 5 = Copilot, review 4 = MX Master) ──────────────
INSERT INTO timeline_entries (review_id, title, content, rating) VALUES
(5, 'Month 1 — First impressions',
 'Initially surprised by how often suggestions are correct for common patterns. Saving maybe 15 minutes per day.',
 4),
(5, 'Month 3 — Productivity plateau',
 'Accepted Copilot completions less often as I learned its failure modes. Still valuable for tests and docs.',
 4),
(5, 'Month 6 — Final verdict',
 'Net positive. The time saved on boilerplate outweighs the occasional hallucination. Essential for solo projects.',
 4),
(4, 'After 3 months of daily use',
 'Zero issues with the Bluetooth connection. The thumb rest proves its value on marathon sessions.',
 5);

-- ── Comments ─────────────────────────────────────────────────────────────────
INSERT INTO comments (review_id, user_id, content) VALUES
(1, 2, 'Agreed on the ANC. I switched from Bose QC45 and have not looked back.'),
(1, 3, 'Do you find call quality acceptable in noisy environments?'),
(1, 4, 'Mine started peeling at the ear cushions after 18 months — be aware.'),
(2, 1, 'The RAM pricing is highway robbery but the performance makes it hard to resist.'),
(3, 4, 'What template did you start with? I am still designing my system.'),
(3, 5, 'The database feature in Notion is what sold me. Kanban + calendar view is killer.'),
(5, 1, 'Good to hear a nuanced take. Most Copilot reviews are either pure hype or pure FUD.'),
(8, 2, 'The Dataview plugin is a game-changer. Agree completely.'),
(9, 3, 'Vercel pricing can sneak up on you at scale — keep an eye on function invocations.');

-- ── Likes ─────────────────────────────────────────────────────────────────────
INSERT INTO review_likes (user_id, review_id) VALUES
(2, 1), (3, 1), (4, 1), (5, 1),
(1, 2), (3, 2), (4, 2),
(1, 3), (2, 3), (4, 3), (5, 3),
(2, 4), (3, 4),
(1, 5), (3, 5), (5, 5),
(1, 6), (2, 6), (3, 6), (4, 6),
(1, 7), (5, 7),
(1, 8), (2, 8), (3, 8),
(2, 9), (4, 9),
(1, 10), (3, 10), (5, 10);

INSERT INTO comment_likes (user_id, comment_id) VALUES
(1, 1), (4, 1), (5, 1),
(1, 2),
(2, 4),
(1, 7), (2, 7);
