"use client";

import { MessageSquarePlus, Settings, Trash2, X } from "lucide-react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

export function Sidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onOpenSettings,
  className,
  onClose,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
  onOpenSettings: () => void;
  className?: string;
  onClose?: () => void;
}) {
  const [listRef] = useAutoAnimate();

  return (
    <aside
      className={cn(
        "glass-panel flex h-full w-64 shrink-0 flex-col rounded-2xl bg-sidebar text-sidebar-foreground",
        className
      )}
    >
      <div className="flex items-center gap-2 p-3">
        <Button onClick={onNew} className="flex-1 justify-start" variant="outline">
          <MessageSquarePlus className="size-4" />
          新对话
        </Button>
        {onClose && (
          <Button size="icon" variant="ghost" onClick={onClose} className="md:hidden" aria-label="关闭菜单">
            <X className="size-4" />
          </Button>
        )}
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div ref={listRef} className="flex flex-col gap-0.5 p-2">
          {conversations.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              还没有对话
            </p>
          )}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex cursor-pointer items-center rounded-lg px-2 py-2 text-sm transition-colors duration-200 ease-[cubic-bezier(0.32,0.72,0,1)]",
                c.id === activeId
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.4)]"
                  : "hover:bg-sidebar-accent/50"
              )}
              onClick={() => onSelect(c.id)}
            >
              <span className="flex-1 truncate">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(c.id);
                }}
                className="opacity-0 transition-opacity group-hover:opacity-100"
                aria-label="删除对话"
              >
                <Trash2 className="size-4 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          ))}
        </div>
      </ScrollArea>
      <Separator />
      <div className="p-3">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={onOpenSettings}
        >
          <Settings className="size-4" />
          设置
        </Button>
      </div>
    </aside>
  );
}
