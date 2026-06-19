export interface StaticProduct {
  id: string;
  name: string;
  category: "physical" | "service" | "digital";
  image_url: string | null;
  created_at: string;
}

export interface StaticReview {
  id: string;
  product_id: string;
  title: string;
  content: string;
  rating: number;
  likes_count: number;
  comments_count: number;
  created_at: string;
  images: string[];
  author: { username: string; avatar_url: string | null };
}

export const staticProducts: StaticProduct[] = [
  { id: "p1", name: "Sony WH-1000XM5", category: "physical", image_url: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=400&h=300&fit=crop", created_at: "2024-01-15T10:00:00Z" },
  { id: "p2", name: "Spotify Premium", category: "digital", image_url: "https://images.unsplash.com/photo-1614680376593-902f74cf0d41?w=400&h=300&fit=crop", created_at: "2024-02-10T10:00:00Z" },
  { id: "p3", name: "TaskRabbit Cleaning", category: "service", image_url: "https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400&h=300&fit=crop", created_at: "2024-03-05T10:00:00Z" },
  { id: "p4", name: "Samsung Galaxy S23 Ultra", category: "physical", image_url: "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&h=300&fit=crop", created_at: "2024-01-20T10:00:00Z" },
  { id: "p5", name: "Notion", category: "digital", image_url: "https://images.unsplash.com/photo-1611224923853-80b023f02d71?w=400&h=300&fit=crop", created_at: "2024-02-25T10:00:00Z" },
  { id: "p6", name: "Blue Apron", category: "service", image_url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400&h=300&fit=crop", created_at: "2024-03-15T10:00:00Z" },
  { id: "p7", name: "LG InstaView Fridge", category: "physical", image_url: "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?w=400&h=300&fit=crop", created_at: "2024-01-28T10:00:00Z" },
  { id: "p8", name: "Figma", category: "digital", image_url: "https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=400&h=300&fit=crop", created_at: "2024-02-18T10:00:00Z" },
];

export const staticReviews: StaticReview[] = [
  { id: "r1", product_id: "p1", title: "Best noise-cancelling headphones I've owned", content: "The noise cancellation is absolutely incredible. I use these daily for work calls and music. Battery life is exceptional at 30+ hours. The ear cushions are comfortable even after hours of use.", rating: 5, likes_count: 24, comments_count: 5, created_at: "2024-02-01T12:00:00Z", images: [], author: { username: "AudioEnthusiast", avatar_url: null } },
  { id: "r2", product_id: "p1", title: "Great but a bit pricey", content: "Sound quality is top-tier and the ANC is class-leading. A bit expensive but worth it if you're a serious listener. The app is decent but could be improved.", rating: 4, likes_count: 12, comments_count: 3, created_at: "2024-02-15T12:00:00Z", images: [], author: { username: "MusicLover42", avatar_url: null } },
  { id: "r3", product_id: "p2", title: "Worth every penny", content: "Spotify Premium is a game-changer. Offline downloads, no ads, and the Discover Weekly playlist is genuinely impressive. The cross-device sync is seamless.", rating: 5, likes_count: 31, comments_count: 8, created_at: "2024-03-01T12:00:00Z", images: [], author: { username: "StreamingFan", avatar_url: null } },
  { id: "r4", product_id: "p2", title: "Good but catalog has gaps", content: "Overall a solid service. Some artists are missing from the catalog which is frustrating. But for mainstream music it's excellent and the UI is clean.", rating: 4, likes_count: 9, comments_count: 2, created_at: "2024-03-10T12:00:00Z", images: [], author: { username: "CriticalListener", avatar_url: null } },
  { id: "r5", product_id: "p3", title: "Professional and thorough", content: "The cleaner arrived on time and did a thorough job. My apartment has never looked this clean. Every surface was wiped, every corner vacuumed. Will definitely book again.", rating: 5, likes_count: 15, comments_count: 4, created_at: "2024-03-20T12:00:00Z", images: [], author: { username: "TidyHome", avatar_url: null } },
  { id: "r6", product_id: "p4", title: "Flagship phone done right", content: "The S Pen integration is seamless. The camera system is incredible, especially for night photography. Performance is blazing fast with zero lag even on demanding apps.", rating: 5, likes_count: 42, comments_count: 11, created_at: "2024-02-05T12:00:00Z", images: [], author: { username: "TechReviewer", avatar_url: null } },
  { id: "r7", product_id: "p4", title: "Excellent but battery could be better", content: "Incredibly powerful phone with the best Android camera system on the market. My only gripe is battery life — heavy usage drains it by afternoon.", rating: 4, likes_count: 19, comments_count: 6, created_at: "2024-02-20T12:00:00Z", images: [], author: { username: "PowerUser", avatar_url: null } },
  { id: "r8", product_id: "p5", title: "Transformed my productivity", content: "I use Notion for everything — notes, project management, wikis, and databases. The flexibility is unmatched. There's a learning curve but once you get it, there's no going back.", rating: 5, likes_count: 38, comments_count: 7, created_at: "2024-03-08T12:00:00Z", images: [], author: { username: "ProductivityNerd", avatar_url: null } },
  { id: "r9", product_id: "p6", title: "Fresh ingredients, fun recipes", content: "The meal kits are well-portioned with clear step-by-step instructions. A few recipes missed the mark taste-wise but most were delicious. Great for learning new cooking techniques.", rating: 4, likes_count: 18, comments_count: 3, created_at: "2024-03-25T12:00:00Z", images: [], author: { username: "HomeCook", avatar_url: null } },
  { id: "r10", product_id: "p7", title: "Stunning fridge with smart features", content: "The InstaView door-in-door is genuinely useful — knock twice to see inside without opening. The craft ice maker is a nice luxury. Energy efficient and very quiet.", rating: 5, likes_count: 21, comments_count: 4, created_at: "2024-02-12T12:00:00Z", images: [], author: { username: "SmartHomeGuy", avatar_url: null } },
  { id: "r11", product_id: "p8", title: "The best design tool period", content: "Figma has completely replaced Sketch and Adobe XD in my workflow. Real-time collaboration with the team is flawless. The component system and auto-layout save hours every week.", rating: 5, likes_count: 55, comments_count: 9, created_at: "2024-03-12T12:00:00Z", images: [], author: { username: "UIDesigner", avatar_url: null } },
];
