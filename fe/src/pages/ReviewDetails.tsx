import { useParams, Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Calendar, MessageCircle, ThumbsUp, Share2, Clock, BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { PageHead } from "@/components/PageHead";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, type ApiReviewDetail, type ApiComment } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

const StarRating = ({ rating }: { rating: number }) => (
  <div className="flex items-center gap-1">
    {[1, 2, 3, 4, 5].map((star) => (
      <svg
        key={star}
        className={`w-5 h-5 ${
          star <= rating
            ? "text-primary fill-primary"
            : star - 0.5 <= rating
            ? "text-primary fill-primary/50"
            : "text-muted-foreground"
        }`}
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
    ))}
    <span className="ml-2 text-sm font-medium text-foreground">{rating}</span>
  </div>
);

const ReviewDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();

  const { data: review, isLoading, isError } = useQuery({
    queryKey: ["review", id ? Number(id) : null],
    queryFn: () => apiFetch<ApiReviewDetail>(`/reviews/${id}`),
    enabled: !!id,
  });

  // Sync mutable state from query data
  const [likesCount, setLikesCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [comments, setComments] = useState<ApiComment[]>([]);
  const [commentLikes, setCommentLikes] = useState<Record<number, number>>({});
  const [commentInput, setCommentInput] = useState("");
  const [postingComment, setPostingComment] = useState(false);

  useEffect(() => {
    if (review) {
      setLikesCount(review.likes_count);
      setComments(review.comments ?? []);
      const likes: Record<number, number> = {};
      (review.comments ?? []).forEach((c) => { likes[c.id] = c.likes_count; });
      setCommentLikes(likes);
    }
  }, [review]);

  // Increment view count once per mount
  useEffect(() => {
    if (id) {
      apiFetch(`/reviews/${id}/view`, { method: "POST" }, null).catch(() => {});
    }
  }, [id]);

  const handleLike = async () => {
    if (!user) { navigate("/auth"); return; }
    try {
      const res = await apiFetch<{ liked: boolean; likes_count: number }>(
        `/reviews/${id}/like`,
        { method: "POST" }
      );
      setLikesCount(res.likes_count);
      setLiked(res.liked);
    } catch {}
  };

  const handlePostComment = async () => {
    if (!user) { navigate("/auth"); return; }
    if (!commentInput.trim()) return;
    setPostingComment(true);
    try {
      await apiFetch(`/reviews/${id}/comments`, {
        method: "POST",
        body: JSON.stringify({ content: commentInput.trim() }),
      });
      setCommentInput("");
      toast({ title: t("review.commentSubmitted"), description: t("review.commentModeration") });
    } catch (err: any) {
      toast({ title: t("review.error"), description: err.message ?? t("review.failedToPostComment"), variant: "destructive" });
    } finally {
      setPostingComment(false);
    }
  };

  const handleCommentLike = async (commentId: number) => {
    if (!user) { navigate("/auth"); return; }
    try {
      const res = await apiFetch<{ liked: boolean; likes_count: number }>(
        `/reviews/${id}/comments/${commentId}/like`,
        { method: "POST" }
      );
      setCommentLikes((prev) => ({ ...prev, [commentId]: res.likes_count }));
    } catch {}
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 container mx-auto px-4 max-w-4xl">
          <div className="animate-pulse space-y-6">
            <div className="h-6 bg-muted rounded w-24" />
            <div className="h-10 bg-muted rounded w-3/4" />
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !review) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="pt-24 pb-16 container mx-auto px-4 max-w-4xl">
          <div className="text-center py-20 text-muted-foreground">{t("review.notFound")}</div>
        </main>
        <Footer />
      </div>
    );
  }

  const isAuthor = user && user.id === review.author.id;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://bdranks.com";
  const reviewJsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Review",
      name: review.title,
      reviewRating: {
        "@type": "Rating",
        ratingValue: String(review.rating),
        bestRating: "5",
        worstRating: "1",
      },
      author: { "@type": "Person", name: review.author.username },
      itemReviewed: { "@type": "Product", name: review.product.name },
      datePublished: review.created_at,
      description: review.excerpt,
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: origin },
        { "@type": "ListItem", position: 2, name: "Browse Reviews", item: `${origin}/browse` },
        { "@type": "ListItem", position: 3, name: review.title, item: `${origin}/review/${review.id}` },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <PageHead
        title={review.title}
        description={review.excerpt ?? `${review.author.username} reviewed ${review.product.name} — rated ${review.rating}/5.`}
        ogType="article"
        ogImage={review.images?.[0]}
        jsonLd={reviewJsonLd}
      />
      <Header />

      <main className="pt-24 pb-16">
        <div className="container mx-auto px-4 max-w-4xl">
          <Link to="/" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" />
            {t("review.backToReviews")}
          </Link>

          <article>
            <header className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <Badge variant={review.category as any}>
                  {review.category}
                </Badge>
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(review.created_at)}
                </span>
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-6">
                {review.title}
              </h1>

              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={review.author.avatar_url} />
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {review.author.username.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-semibold text-foreground">{review.author.username}</p>
                  </div>
                </div>

                <StarRating rating={review.rating} />
              </div>
            </header>

            {/* Images */}
            {review.images && review.images.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {review.images.map((image, index) => (
                  <div key={index} className="relative aspect-video rounded-xl overflow-hidden">
                    <img
                      src={image}
                      alt={`${review.title} — photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Content */}
            <div className="prose prose-lg max-w-none mb-12">
              <p className="text-foreground/90 leading-relaxed whitespace-pre-line">
                {review.content}
              </p>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-6 py-4 border-y border-border mb-12">
              <Button
                variant="ghost"
                size="sm"
                className={`gap-2 ${liked ? "text-primary" : ""}`}
                onClick={handleLike}
              >
                <ThumbsUp className={`w-4 h-4 ${liked ? "fill-primary" : ""}`} />
                <span>{likesCount}</span>
              </Button>
              <Button variant="ghost" size="sm" className="gap-2">
                <MessageCircle className="w-4 h-4" />
                <span>{comments.length}</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-2"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href);
                  toast({ title: t("review.linkCopied") });
                }}
              >
                <Share2 className="w-4 h-4" />
                {t("review.share")}
              </Button>
              <span className="ml-auto text-sm text-muted-foreground">
                {(review.views_count ?? 0).toLocaleString()} {t("review.views")}
              </span>
            </div>

            {/* Timeline Section */}
            {review.timeline && review.timeline.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
                    <Clock className="w-6 h-6 text-primary" />
                    {t("review.productTimeline")}
                  </h2>
                  {isAuthor && (
                    <Link to={`/review/${id}/add-timeline`}>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Clock className="w-4 h-4" />
                        {t("review.addUpdate")}
                      </Button>
                    </Link>
                  )}
                </div>

                <div className="relative">
                  <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                  <div className="space-y-6">
                    {review.timeline.map((entry, index) => (
                      <div key={entry.id ?? index} className="relative pl-12">
                        <div className="absolute left-2 top-2 w-5 h-5 rounded-full bg-primary border-4 border-background" />
                        <Card className="overflow-hidden">
                          <CardHeader className="pb-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <p className="text-sm text-primary font-medium">
                                  {new Date(entry.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US", {
                                    year: "numeric",
                                    month: "long",
                                  })}
                                </p>
                                <h3 className="font-display text-lg font-semibold text-foreground">
                                  {entry.title}
                                </h3>
                              </div>
                              <StarRating rating={entry.rating} />
                            </div>
                          </CardHeader>
                          <CardContent>
                            <p className="text-foreground/80 mb-4">{entry.content}</p>
                            {entry.image_url && (
                              <div className="relative aspect-video rounded-lg overflow-hidden max-w-sm">
                                <img
                                  src={entry.image_url}
                                  alt={entry.title}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

            {/* Add Timeline button when no entries yet (author only) */}
            {isAuthor && (!review.timeline || review.timeline.length === 0) && (
              <div className="mb-12 flex justify-center">
                <Link to={`/review/${id}/add-timeline`}>
                  <Button variant="outline" className="gap-2">
                    <Clock className="w-4 h-4" />
                    {t("review.addTimelineEntry")}
                  </Button>
                </Link>
              </div>
            )}

            <Separator className="my-12" />

            {/* Comments Section */}
            <section>
              <h2 className="font-display text-2xl font-bold text-foreground mb-6 flex items-center gap-2">
                <MessageCircle className="w-6 h-6 text-primary" />
                {t("review.comments")} ({comments.length})
              </h2>

              {/* Add Comment */}
              <Card className="mb-8">
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={user?.avatar_url} />
                      <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                        {user ? user.username?.charAt(0).toUpperCase() ?? "U" : "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 space-y-3">
                      <Textarea
                        placeholder={user ? t("review.commentPlaceholder") : t("review.signInToComment")}
                        className="min-h-[100px] resize-none"
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        disabled={!user}
                      />
                      <div className="flex justify-end">
                        <Button
                          onClick={handlePostComment}
                          disabled={!user || postingComment || !commentInput.trim()}
                        >
                          {postingComment ? t("review.posting") : t("review.postComment")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Comments List */}
              <div className="space-y-6">
                {comments.map((comment) => (
                  comment.is_owner_reply ? (
                    /* ── Official owner reply card ── */
                    <div key={comment.id} className="rounded-xl border-2 border-primary/30 overflow-hidden shadow-sm">
                      {/* Header strip */}
                      <div className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground">
                        <BadgeCheck className="w-4 h-4 flex-shrink-0" />
                        <span className="text-sm font-semibold tracking-wide">{t("review.officialResponse")}</span>
                        <span className="text-primary-foreground/70 text-sm">·</span>
                        <span className="text-sm font-medium text-primary-foreground/90">{comment.company_name}</span>
                      </div>
                      {/* Body */}
                      <div className="bg-primary/[0.04] px-5 py-4">
                        <div className="flex gap-4">
                          <Avatar className="w-10 h-10 ring-2 ring-primary/30">
                            <AvatarImage src={comment.author.avatar_url} />
                            <AvatarFallback className="bg-primary text-primary-foreground text-sm font-bold">
                              {comment.author.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-foreground">{comment.author.username}</span>
                              <span className="text-sm text-muted-foreground">
                                · {new Date(comment.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US")}
                              </span>
                            </div>
                            <p className="text-foreground/85 mb-3 leading-relaxed">{comment.content}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-muted-foreground hover:text-foreground"
                              onClick={() => handleCommentLike(comment.id)}
                            >
                              <ThumbsUp className="w-4 h-4" />
                              <span>{commentLikes[comment.id] ?? comment.likes_count}</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Regular comment card ── */
                    <Card key={comment.id}>
                      <CardContent className="pt-6">
                        <div className="flex gap-4">
                          <Avatar className="w-10 h-10">
                            <AvatarImage src={comment.author.avatar_url} />
                            <AvatarFallback className="bg-primary/10 text-primary text-sm">
                              {comment.author.username.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <span className="font-semibold text-foreground">{comment.author.username}</span>
                              <span className="text-sm text-muted-foreground">
                                · {new Date(comment.created_at).toLocaleDateString(i18n.language === "bn" ? "bn-BD" : "en-US")}
                              </span>
                            </div>
                            <p className="text-foreground/80 mb-3">{comment.content}</p>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-muted-foreground hover:text-foreground"
                              onClick={() => handleCommentLike(comment.id)}
                            >
                              <ThumbsUp className="w-4 h-4" />
                              <span>{commentLikes[comment.id] ?? comment.likes_count}</span>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                ))}
              </div>
            </section>
          </article>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default ReviewDetails;
