import type { Platform } from "../../lib/constants";
import { PLATFORMS } from "../../lib/constants";
import { Linkedin, Twitter, Video } from "lucide-react";

interface PlatformTabsProps {
  activePlatform: Platform;
  onPlatformChange: (platform: Platform) => void;
  counts: Record<Platform, number>;
  isStreaming?: boolean;
  currentPlatform?: Platform | null;
}

const platformIcons: Record<Platform, React.ReactNode> = {
  linkedin: <Linkedin className="w-4 h-4" />,
  twitter: <Twitter className="w-4 h-4" />,
  tiktok: <Video className="w-4 h-4" />,
};

const platformLabels: Record<Platform, string> = {
  linkedin: "LinkedIn",
  twitter: "Twitter/X",
  tiktok: "TikTok",
};

export function PlatformTabs({
  activePlatform,
  onPlatformChange,
  counts,
  isStreaming = false,
  currentPlatform = null,
}: PlatformTabsProps) {
  return (
    <div className="flex border-b border-gray-200 bg-gray-50">
      {PLATFORMS.map((platform) => {
        const isActive = platform === activePlatform;
        const isGenerating = isStreaming && platform === currentPlatform;
        const count = counts[platform] || 0;

        return (
          <button
            key={platform}
            onClick={() => onPlatformChange(platform)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-sm font-medium transition-all relative ${
              isActive
                ? "text-blue-600 border-b-2 border-blue-600 -mb-px bg-white"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            <span className={isGenerating ? "animate-pulse" : ""}>
              {platformIcons[platform]}
            </span>
            <span className="hidden sm:inline">{platformLabels[platform]}</span>

            {count > 0 && (
              <span
                className={`px-1.5 py-0.5 text-xs rounded-full min-w-[18px] text-center transition-all ${
                  isActive
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-200 text-gray-600"
                } ${isGenerating ? "animate-pulse" : ""}`}
              >
                {count}
              </span>
            )}

            {isGenerating && (
              <span className="absolute top-1 right-1 w-2 h-2 bg-green-500 rounded-full animate-ping" />
            )}
          </button>
        );
      })}
    </div>
  );
}
