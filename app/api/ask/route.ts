import { api, json, body, sameOrigin, str, ipKey } from "@/lib/http";
import { currentUser } from "@/lib/auth";
import { limit } from "@/lib/ratelimit";
import { answer, retrieve } from "@/lib/ask";

export const maxDuration = 60;

const DISCLAIMER = "Information juridique générale, pas un avis personnalisé. Vérifiez auprès d'un professionnel avant d'agir.";

export const POST = api(async (req) => {
  sameOrigin(req);
  const b = await body(req, 8192);
  const question = str(b.question, "question", { min: 6, max: 1000 });
  const user = await currentUser(req).catch(() => null);
  if (user) await limit("ask-user:" + user.id, 60, 3600);
  else await limit(ipKey(req, "ask-ip"), 15, 3600);

  const passages = await retrieve(question);
  if (!passages.length) {
    return json({
      grounded: false,
      answer: "Je n'ai pas trouvé de texte de loi qui réponde à cette question dans les documents dont je dispose. Reformulez avec d'autres mots, ou consultez un professionnel du droit.",
      citations: [],
      disclaimer: DISCLAIMER,
    });
  }
  const res = await answer(question, passages);
  return json({ grounded: true, answer: res.text, citations: res.citations, disclaimer: DISCLAIMER });
});
