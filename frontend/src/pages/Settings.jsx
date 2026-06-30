import React, { useState } from "react";
import TopNav from "@/components/TopNav";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Upload, Lock } from "lucide-react";
import { toast } from "sonner";

export default function Settings() {
  const { user, refresh } = useAuth();
  const [uploading, setUploading] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (user.plan !== "studio") { toast.error("Studio plan required for white-label branding"); return; }
    if (file.size > 250 * 1024) { toast.error("Logo must be < 250KB"); return; }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await api.post("/settings/brand-logo", { brand_logo: reader.result });
        toast.success("Brand logo updated");
        refresh();
      } catch { toast.error("Upload failed"); }
      finally { setUploading(false); }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#EDEDF0]">
      <TopNav/>
      <main className="max-w-[800px] mx-auto px-4 sm:px-8 py-12">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#5C5C66]">Account · Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">Settings.</h1>

        <section className="mt-10 border border-[#232326] rounded-sm bg-[#121214] p-6">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-3">Profile</p>
          <div className="flex items-center gap-4">
            <Avatar className="w-14 h-14 border border-[#232326]"><AvatarImage src={user?.picture}/><AvatarFallback>{user?.name?.[0]}</AvatarFallback></Avatar>
            <div>
              <p className="font-medium">{user?.name}</p>
              <p className="font-mono text-xs text-[#8A8A93]">{user?.email}</p>
              <p className="font-mono text-[10px] uppercase tracking-wider text-[#5A67D8] mt-1">Plan · {user?.plan}</p>
            </div>
          </div>
        </section>

        <section className="mt-6 border border-[#232326] rounded-sm bg-[#121214] p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[#8A8A93] mb-1">White-label brand logo</p>
              <h3 className="text-lg font-medium">Replace app branding on dashboard & exported PDFs</h3>
              <p className="text-sm text-[#8A8A93] mt-1">Studio plan only · PNG/JPG, &lt;250KB. Subscribed users see your logo on every export.</p>
            </div>
            {user?.plan !== "studio" && <Lock className="w-4 h-4 text-[#5C5C66]"/>}
          </div>
          {user?.brand_logo && (
            <div className="mt-4 border border-[#232326] rounded-sm p-3 bg-[#0A0A0B]"><img src={user.brand_logo} alt="brand" className="h-10"/></div>
          )}
          <div className="mt-4">
            <label className="inline-flex items-center gap-2 px-3 py-2 border border-[#232326] rounded-sm cursor-pointer hover:bg-[#1a1a1d]">
              <Upload className="w-4 h-4"/><span className="font-mono text-xs uppercase tracking-wider">{uploading ? "Uploading…" : "Upload logo"}</span>
              <input data-testid="brand-logo-input" type="file" accept="image/png,image/jpeg" className="hidden" onChange={onFile} disabled={user?.plan !== "studio"}/>
            </label>
          </div>
        </section>
      </main>
    </div>
  );
}
