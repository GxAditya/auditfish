import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useApiKey } from "@/lib/local-store";

export function KeyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { apiKey, save } = useApiKey();
  const [value, setValue] = useState("");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Your TinyFish API key</DialogTitle>
          <DialogDescription>
            AuditFish runs on your own TinyFish account. The key stays in this browser and is only sent along with your checks. Get one at{" "}
            <a className="underline" href="https://agent.tinyfish.ai/api-keys" target="_blank" rel="noreferrer">agent.tinyfish.ai</a>.
          </DialogDescription>
        </DialogHeader>
        <Input type="password" placeholder={apiKey ? "•••••••• (saved) — paste to replace" : "sk-tinyfish-…"} value={value} onChange={(e) => setValue(e.target.value)} />
        <DialogFooter className="gap-2">
          {apiKey && (
            <Button variant="outline" onClick={() => { save(null); onOpenChange(false); }}>Remove key</Button>
          )}
          <Button disabled={value.trim().length < 10} onClick={() => { save(value); setValue(""); onOpenChange(false); }}>Save key</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function KeyRequired({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="rounded-md border border-dashed border-rule bg-card p-8 text-center">
      <KeyRound className="mx-auto h-6 w-6 text-primary" />
      <h2 className="mt-3 text-xl">Connect your TinyFish key to start</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Every check is run live against the official registry using your TinyFish account. Nothing is stored on our side.</p>
      <Button className="mt-5" onClick={onOpen}>Add API key</Button>
    </div>
  );
}
