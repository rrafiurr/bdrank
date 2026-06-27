import { useTranslation } from "react-i18next";
import { Globe, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

const LANGS = [
  { code: "en", labelKey: "language.english" },
  { code: "bn", labelKey: "language.bangla" },
] as const;

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith("bn") ? "bn" : "en";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full h-9 w-9"
          aria-label={t("language.change")}
        >
          <Globe className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="rounded-2xl">
        {LANGS.map((l) => (
          <DropdownMenuItem
            key={l.code}
            className="cursor-pointer rounded-xl"
            onClick={() => i18n.changeLanguage(l.code)}
          >
            <span className="flex-1">{t(l.labelKey)}</span>
            {current === l.code && <Check className="h-4 w-4 ml-2" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
