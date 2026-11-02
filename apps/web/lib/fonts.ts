import { Chakra_Petch, Charm, Itim, Kanit, Mitr, Prompt, Pridi } from "next/font/google";

// Display fonts for an event's title (Thai + Latin). preload: false — the browser only downloads
// the one an event actually uses.
const kanit = Kanit({ subsets: ["thai", "latin"], weight: ["600", "700"], preload: false, display: "swap" });
const prompt = Prompt({ subsets: ["thai", "latin"], weight: ["600", "700"], preload: false, display: "swap" });
const mitr = Mitr({ subsets: ["thai", "latin"], weight: ["500", "600"], preload: false, display: "swap" });
const chakra = Chakra_Petch({ subsets: ["thai", "latin"], weight: ["600", "700"], preload: false, display: "swap" });
const pridi = Pridi({ subsets: ["thai", "latin"], weight: ["600"], preload: false, display: "swap" });
const charm = Charm({ subsets: ["thai", "latin"], weight: ["700"], preload: false, display: "swap" });
const itim = Itim({ subsets: ["thai", "latin"], weight: ["400"], preload: false, display: "swap" });

export type TitleFont = "noto" | "kanit" | "prompt" | "mitr" | "chakra" | "pridi" | "charm" | "itim";

export const TITLE_FONTS: { key: TitleFont; label: string; className: string }[] = [
  { key: "noto", label: "มาตรฐาน", className: "" },
  { key: "kanit", label: "Kanit · หนาทันสมัย", className: kanit.className },
  { key: "prompt", label: "Prompt · กลมมน", className: prompt.className },
  { key: "mitr", label: "Mitr · เป็นกันเอง", className: mitr.className },
  { key: "chakra", label: "Chakra Petch · เทคโนโลยี", className: chakra.className },
  { key: "pridi", label: "Pridi · ทางการ มีเชิง", className: pridi.className },
  { key: "charm", label: "Charm · ลายมือหวาน", className: charm.className },
  { key: "itim", label: "Itim · ลายมือสนุก", className: itim.className },
];

export function titleFontClass(key: string | undefined) {
  return TITLE_FONTS.find((f) => f.key === key)?.className ?? "";
}
