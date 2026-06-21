import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Plus,
  Trash2,
  UserCircle,
  Youtube,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  connectPlatformUrl,
  deleteAccount,
  getSocialStatus,
  setDefaultAccount,
} from "../api";
import type { SocialAccount, SocialStatus } from "../types";

interface Props {
  youtubeAccountId: number | null;
  tiktokAccountId: number | null;
  onYoutubeAccountId: (id: number | null) => void;
  onTiktokAccountId: (id: number | null) => void;
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V9.01a8.24 8.24 0 0 0 4.74 1.52V7.06a4.83 4.83 0 0 1-1.05-.25z" />
    </svg>
  );
}

function AccountList({
  platform,
  accounts,
  selectedId,
  onSelect,
  onDelete,
  configured,
  icon,
  label,
}: {
  platform: "youtube" | "tiktok";
  accounts: SocialAccount[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onDelete: (id: number) => void;
  configured: boolean;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium">{label}</span>
        </div>
        {configured ? (
          <a
            href={connectPlatformUrl(platform)}
            className="btn-secondary text-xs py-2 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Add account
          </a>
        ) : (
          <span className="text-xs text-gray-500">Add API keys to .env</span>
        )}
      </div>

      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">
          No {label} accounts connected. Connect one to schedule or upload clips.
        </p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((acc) => (
            <li
              key={acc.id}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 transition ${
                selectedId === acc.id
                  ? "border-brand bg-brand/10"
                  : "border-surface-border hover:border-brand/40"
              }`}
            >
              <input
                type="radio"
                name={`${platform}-account`}
                checked={selectedId === acc.id}
                onChange={() => onSelect(acc.id)}
                className="accent-brand"
              />
              <UserCircle className="h-5 w-5 shrink-0 text-gray-400" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{acc.display_name}</p>
                {acc.is_default && (
                  <p className="text-xs text-gray-500">Default</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDelete(acc.id)}
                className="rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400"
                title="Remove account"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {accounts.length > 0 && (
        <button
          type="button"
          onClick={() => onSelect(null)}
          className="mt-3 text-xs text-gray-500 hover:text-gray-300"
        >
          Skip {label} for this batch
        </button>
      )}
    </div>
  );
}

export default function AccountManager({
  youtubeAccountId,
  tiktokAccountId,
  onYoutubeAccountId,
  onTiktokAccountId,
}: Props) {
  const [social, setSocial] = useState<SocialStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);
  const [showOAuthHelp, setShowOAuthHelp] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("success") === "0";
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await getSocialStatus();
      setSocial(status);

      if (!initialized.current) {
        const yt = status.accounts.filter((a) => a.platform === "youtube");
        const tt = status.accounts.filter((a) => a.platform === "tiktok");
        if (!youtubeAccountId && yt.length > 0) {
          const def = yt.find((a) => a.is_default) ?? yt[0];
          onYoutubeAccountId(def.id);
        }
        if (!tiktokAccountId && tt.length > 0) {
          const def = tt.find((a) => a.is_default) ?? tt[0];
          onTiktokAccountId(def.id);
        }
        initialized.current = true;
      }

      const needsHelp =
        (status.youtube_configured &&
          status.accounts.filter((a) => a.platform === "youtube").length === 0) ||
        (status.tiktok_configured &&
          status.accounts.filter((a) => a.platform === "tiktok").length === 0);
      if (needsHelp) setShowOAuthHelp(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load accounts");
    } finally {
      setLoading(false);
    }
  }, [youtubeAccountId, tiktokAccountId, onYoutubeAccountId, onTiktokAccountId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (id: number) => {
    try {
      await deleteAccount(id);
      if (youtubeAccountId === id) onYoutubeAccountId(null);
      if (tiktokAccountId === id) onTiktokAccountId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to remove account");
    }
  };

  const handleSelectYoutube = async (id: number | null) => {
    onYoutubeAccountId(id);
    if (id) {
      try {
        await setDefaultAccount(id);
      } catch {
        /* non-critical */
      }
    }
  };

  const handleSelectTiktok = async (id: number | null) => {
    onTiktokAccountId(id);
    if (id) {
      try {
        await setDefaultAccount(id);
      } catch {
        /* non-critical */
      }
    }
  };

  if (loading && !social) {
    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading accounts...
      </div>
    );
  }

  const youtubeAccounts =
    social?.accounts.filter((a) => a.platform === "youtube") ?? [];
  const tiktokAccounts =
    social?.accounts.filter((a) => a.platform === "tiktok") ?? [];

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold">Choose accounts</h2>
        <p className="mt-1 text-gray-400">
          Pick which YouTube or TikTok accounts will receive your clips. You can
          connect multiple accounts and switch per batch.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {(social?.youtube_configured || social?.tiktok_configured) && (
        <div className="mb-6">
          <button
            type="button"
            onClick={() => setShowOAuthHelp((v) => !v)}
            className="flex w-full items-center gap-2 text-sm text-gray-400 hover:text-gray-200"
          >
            <ChevronDown
              className={`h-4 w-4 transition ${showOAuthHelp ? "rotate-180" : ""}`}
            />
            OAuth redirect URI setup (only needed if connect fails)
          </button>
          {showOAuthHelp && (
            <div className="mt-3 space-y-3 rounded-xl border border-surface-border bg-surface/40 px-4 py-3 text-sm text-gray-300">
              {social?.youtube_configured && (
                <div>
                  <p className="font-medium text-gray-200">YouTube (Google Cloud)</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Credentials → OAuth client → Authorized redirect URIs:
                  </p>
                  <code className="mt-1 block break-all text-xs text-brand">
                    http://127.0.0.1:8890/api/social/youtube/callback
                  </code>
                  <code className="block break-all text-xs text-brand">
                    http://localhost:8890/api/social/youtube/callback
                  </code>
                  <p className="mt-2 text-xs text-gray-500">
                    If Google says &quot;has not completed verification&quot; or
                    access_denied: OAuth consent screen → Test users → add your
                    Google email, then try again.
                  </p>
                </div>
              )}
              {social?.tiktok_configured && (
                <div>
                  <p className="font-medium text-gray-200">TikTok (developers.tiktok.com)</p>
                  <p className="mt-1 text-xs text-gray-500">
                    Your app → Login Kit → Redirect URI:
                  </p>
                  <code className="mt-1 block break-all text-xs text-brand">
                    http://127.0.0.1:8890/api/social/tiktok/callback
                  </code>
                  <code className="block break-all text-xs text-brand">
                    http://localhost:8890/api/social/tiktok/callback
                  </code>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <AccountList
          platform="youtube"
          accounts={youtubeAccounts}
          selectedId={youtubeAccountId}
          onSelect={handleSelectYoutube}
          onDelete={handleDelete}
          configured={social?.youtube_configured ?? false}
          icon={<Youtube className="h-5 w-5 text-red-500" />}
          label="YouTube"
        />
        <AccountList
          platform="tiktok"
          accounts={tiktokAccounts}
          selectedId={tiktokAccountId}
          onSelect={handleSelectTiktok}
          onDelete={handleDelete}
          configured={social?.tiktok_configured ?? false}
          icon={<TikTokIcon className="h-5 w-5" />}
          label="TikTok"
        />
      </div>

      {(youtubeAccountId || tiktokAccountId) && (
        <div className="mt-6 flex items-center gap-2 text-sm text-brand">
          <CheckCircle2 className="h-4 w-4" />
          Ready to create clips for{" "}
          {[
            youtubeAccountId &&
              youtubeAccounts.find((a) => a.id === youtubeAccountId)?.display_name,
            tiktokAccountId &&
              tiktokAccounts.find((a) => a.id === tiktokAccountId)?.display_name,
          ]
            .filter(Boolean)
            .join(" and ")}
        </div>
      )}
    </div>
  );
}
