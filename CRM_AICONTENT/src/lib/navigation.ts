import {
  Clapperboard,
  Film,
  FolderOpen,
  Image,
  Layers,
  LayoutDashboard,
  Library,
  ListTodo,
  Mic2,
  MonitorPlay,
  Palette,
  Repeat,
  ScanFace,
  ScrollText,
  Settings,
  Shirt,
  TrendingUp,
  Upload,
  Video,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navigation: NavSection[] = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/", icon: LayoutDashboard },
      { label: "Jobs", href: "/jobs", icon: ListTodo },
    ],
  },
  {
    title: "VIDEO GENERATION",
    items: [
      { label: "Single Video Generation", href: "/video/single", icon: Video },
      { label: "Batch Video Generation", href: "/video/batch", icon: Layers },
      { label: "LTX Video Generation", href: "/video/ltx", icon: Film },
      {
        label: "Infinite Talk Generation",
        href: "/video/infinite-talk",
        icon: Mic2,
      },
      { label: "Face Swap", href: "/video/face-swap", icon: ScanFace },
      {
        label: "Video Creation",
        href: "/video/creation",
        icon: Clapperboard,
      },
    ],
  },
  {
    title: "IMAGE GENERATION",
    items: [
      {
        label: "Flexible Image Generation",
        href: "/image/flexible",
        icon: Image,
      },
      {
        label: "Construct Image Generation",
        href: "/image/construct",
        icon: Palette,
      },
    ],
  },
  {
    title: "TOOLS",
    items: [
      { label: "Image Upscaler", href: "/tools/upscaler", icon: Upload },
      { label: "Voice Changer", href: "/tools/voice-changer", icon: Repeat },
      {
        label: "Clothes Builder",
        href: "/tools/clothes-builder",
        icon: Shirt,
      },
    ],
  },
  {
    title: "CONTENT",
    items: [
      { label: "Outputs", href: "/content/outputs", icon: MonitorPlay },
      { label: "Assets", href: "/content/assets", icon: FolderOpen },
      { label: "Trend Finder", href: "/content/trend-finder", icon: TrendingUp },
      { label: "Trend Library", href: "/content/trend-library", icon: Library },
    ],
  },
  {
    title: "ANALYTICS",
    items: [{ label: "Spending", href: "/analytics/spending", icon: Wallet }],
  },
  {
    title: "SYSTEM",
    items: [
      { label: "Settings", href: "/system/settings", icon: Settings },
      { label: "Logs", href: "/system/logs", icon: ScrollText },
    ],
  },
];

export const placeholderPages = navigation
  .flatMap((section) => section.items)
  .filter((item) => item.href !== "/");

export function getPageTitle(pathname: string): string {
  for (const section of navigation) {
    for (const item of section.items) {
      if (item.href === pathname) {
        return item.label;
      }
    }
  }
  return "AiInstaReels";
}
