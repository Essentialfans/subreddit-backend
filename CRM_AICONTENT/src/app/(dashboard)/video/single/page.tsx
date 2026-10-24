import { Syne, DM_Sans } from "next/font/google";
import { SingleGenerationStudio } from "@/components/generation/single-generation-studio";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-studio-display",
  weight: ["600", "700", "800"],
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-studio-body",
  weight: ["400", "500", "600"],
});

export default function SingleGenerationPage() {
  return (
    <div className={`${syne.variable} ${dmSans.variable}`}>
      <SingleGenerationStudio />
    </div>
  );
}
