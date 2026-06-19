USE `review-new`;

CREATE TABLE IF NOT EXISTS pages (
    slug             VARCHAR(100)  NOT NULL PRIMARY KEY,
    title            VARCHAR(255)  NOT NULL,
    meta_description VARCHAR(500),
    content          LONGTEXT      NOT NULL,
    is_published     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO pages (slug, title, meta_description, content) VALUES

('about', 'About Us', 'Learn about BdRanks — the trusted review platform for Bangladesh.',
'<h1>About BdRanks</h1>
<p>BdRanks is Bangladesh\'s leading consumer review platform. Our mission is simple: <strong>Rank. Trust. Choose Better.</strong></p>
<p>We believe every consumer deserves honest, unbiased information before spending their hard-earned money. Whether you\'re buying a physical product, subscribing to a service, downloading software, or trying a new restaurant — BdRanks gives you real reviews from real people.</p>
<h2>What Makes Us Different</h2>
<ul>
  <li><strong>Timeline Reviews</strong> — Follow a product over time. See how quality changes, whether a service improves, or how a restaurant evolves.</li>
  <li><strong>Moderated Content</strong> — Every review and comment is checked to ensure authenticity.</li>
  <li><strong>Multiple Categories</strong> — Physical products, digital services, food, and more.</li>
  <li><strong>Community Driven</strong> — Powered by consumers like you.</li>
</ul>
<h2>Our Story</h2>
<p>Founded with a vision to bring transparency to Bangladeshi commerce, BdRanks started as a small project and has grown into a trusted platform used by thousands of consumers every month.</p>
<h2>Contact Us</h2>
<p>Have questions? Visit our <a href="/page/contact">Contact</a> page or reach out at <a href="mailto:hello@bdranks.com">hello@bdranks.com</a>.</p>'),

('contact', 'Contact Us', 'Get in touch with the BdRanks team.',
'<h1>Contact Us</h1>
<p>We\'d love to hear from you. Whether you have a question, feedback, or a business inquiry — reach out and we\'ll get back to you within 24 hours.</p>
<h2>General Inquiries</h2>
<p>Email: <a href="mailto:hello@bdranks.com">hello@bdranks.com</a></p>
<h2>Business &amp; Partnerships</h2>
<p>Email: <a href="mailto:business@bdranks.com">business@bdranks.com</a></p>
<h2>Report an Issue</h2>
<p>Found a fake review or inappropriate content? Email: <a href="mailto:report@bdranks.com">report@bdranks.com</a></p>
<h2>Social Media</h2>
<ul>
  <li>Facebook: <a href="https://facebook.com/bdranks" target="_blank" rel="noopener">facebook.com/bdranks</a></li>
  <li>Twitter/X: <a href="https://twitter.com/bdranks" target="_blank" rel="noopener">@bdranks</a></li>
</ul>
<h2>Office Hours</h2>
<p>Sunday – Thursday, 9:00 AM – 6:00 PM (BST)</p>'),

('privacy', 'Privacy Policy', 'How BdRanks collects, uses, and protects your data.',
'<h1>Privacy Policy</h1>
<p><em>Last updated: June 2025</em></p>
<p>BdRanks ("we", "us", or "our") is committed to protecting your personal information. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.</p>
<h2>Information We Collect</h2>
<ul>
  <li><strong>Account Information</strong> — Name, email address, and password when you register.</li>
  <li><strong>Profile Information</strong> — Username, bio, and avatar you optionally provide.</li>
  <li><strong>User Content</strong> — Reviews, comments, ratings, and images you submit.</li>
  <li><strong>Usage Data</strong> — Pages visited, searches performed, and features used.</li>
</ul>
<h2>How We Use Your Information</h2>
<ul>
  <li>To operate and improve the platform</li>
  <li>To personalise your experience</li>
  <li>To send service-related notifications (no marketing without consent)</li>
  <li>To detect and prevent fraud or misuse</li>
</ul>
<h2>Data Sharing</h2>
<p>We do not sell your personal data. We may share data with service providers who help us operate the platform, under strict confidentiality agreements.</p>
<h2>Cookies</h2>
<p>We use essential cookies for authentication and session management. No third-party advertising cookies are used.</p>
<h2>Your Rights</h2>
<p>You may request access to, correction of, or deletion of your personal data by emailing <a href="mailto:privacy@bdranks.com">privacy@bdranks.com</a>.</p>
<h2>Contact</h2>
<p>Questions about this policy? Contact us at <a href="mailto:privacy@bdranks.com">privacy@bdranks.com</a>.</p>'),

('terms', 'Terms of Service', 'The rules and guidelines for using BdRanks.',
'<h1>Terms of Service</h1>
<p><em>Last updated: June 2025</em></p>
<p>By accessing or using BdRanks, you agree to be bound by these Terms of Service. Please read them carefully.</p>
<h2>Eligibility</h2>
<p>You must be at least 13 years old to use BdRanks. By using the platform you confirm you meet this requirement.</p>
<h2>User Accounts</h2>
<ul>
  <li>You are responsible for keeping your password secure.</li>
  <li>You may not create accounts for others without their consent.</li>
  <li>One account per person — multiple accounts may be suspended.</li>
</ul>
<h2>Content Rules</h2>
<p>By submitting reviews, comments, or any content you agree that:</p>
<ul>
  <li>Your content is honest and based on genuine experience.</li>
  <li>You will not post defamatory, hateful, or illegal content.</li>
  <li>You will not post fake reviews for products you have not used.</li>
  <li>You grant BdRanks a non-exclusive licence to display your content on the platform.</li>
</ul>
<h2>Prohibited Conduct</h2>
<ul>
  <li>Spamming, scraping, or automated access without permission</li>
  <li>Attempting to manipulate ratings or reviews</li>
  <li>Impersonating other users or businesses</li>
</ul>
<h2>Termination</h2>
<p>We reserve the right to suspend or terminate accounts that violate these terms.</p>
<h2>Limitation of Liability</h2>
<p>BdRanks is provided "as is". We make no warranties regarding accuracy of user-generated content and are not liable for decisions made based on reviews.</p>
<h2>Contact</h2>
<p>Questions? Email <a href="mailto:legal@bdranks.com">legal@bdranks.com</a>.</p>'),

('advertise', 'Advertise with Us', 'Reach thousands of Bangladeshi consumers through BdRanks.',
'<h1>Advertise with BdRanks</h1>
<p>Reach thousands of engaged Bangladeshi consumers who are actively researching products and services before they buy.</p>
<h2>Why Advertise with Us?</h2>
<ul>
  <li><strong>Targeted audience</strong> — People actively in buying mode</li>
  <li><strong>Brand safe</strong> — All content is moderated</li>
  <li><strong>Multiple formats</strong> — Featured listings, sponsored reviews, banner placements</li>
</ul>
<h2>Ad Packages</h2>
<p>We offer flexible packages for businesses of all sizes. Contact our team to discuss what works best for your goals.</p>
<h2>Get in Touch</h2>
<p>Email: <a href="mailto:ads@bdranks.com">ads@bdranks.com</a></p>
<p>We\'ll respond within one business day.</p>');
