"use client";

import * as React from "react";
import { BrutalButton } from "../ui/brutal-button";
import { BrutalInput } from "../ui/brutal-input";
import { saveDraftAction, submitForReviewAction } from "@/actions/article";
import { useRouter } from "next/navigation";

interface BrutalEditorProps {
  initialData?: {
    id?: string;
    articleId?: string;
    filePath?: string;
    title: string;
    content: string;
  };
}

export function BrutalEditor({ initialData }: BrutalEditorProps) {
  const router = useRouter();
  const [title, setTitle] = React.useState(initialData?.title || "");
  const [content, setContent] = React.useState(initialData?.content || "");
  const [revisionId, setRevisionId] = React.useState<string | undefined>(initialData?.id);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSaveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    try {
      const formData = new FormData();
      formData.append("title", title);
      formData.append("content", content);
      if (revisionId) formData.append("revisionId", revisionId);
      if (initialData?.articleId) formData.append("articleId", initialData.articleId);
      if (initialData?.filePath) formData.append("filePath", initialData.filePath);

      const result = await saveDraftAction(formData);
      if (result.success && result.revisionId) {
        setRevisionId(result.revisionId);
        alert("草稿已保存 / Draft Saved!");
      }
    } catch (error) {
      console.error(error);
      alert("保存失败 / Save Failed");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!revisionId) {
      alert("请先保存草稿 / Please save draft first");
      return;
    }
    
    try {
      await submitForReviewAction(revisionId);
      alert("已提交审核 / Submitted for Review!");
      router.push("/draft");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <form onSubmit={handleSaveDraft} className="flex flex-col space-y-6 w-full max-w-5xl mx-auto p-4">
      {/* 标题区 */}
      <div className="flex flex-col space-y-2">
        <label className="text-2xl font-black uppercase tracking-tighter">
          TITLE
        </label>
        <BrutalInput 
          required
          placeholder="ENTER YOUR REBELLIOUS TITLE..." 
          className="text-2xl py-4"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>

      {/* 编辑器主区域 (双栏布局或单栏) */}
      <div className="flex flex-col space-y-2 flex-grow">
        <div className="flex justify-between items-end">
          <label className="text-2xl font-black uppercase tracking-tighter">
            CONTENT (MARKDOWN)
          </label>
          <span className="text-sm font-bold bg-neon-green px-2 py-1 border-2 border-black shadow-brutal-sm">
            Tencent COS Direct Upload Ready
          </span>
        </div>
        
        <textarea 
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full min-h-[500px] border-4 border-black p-4 font-mono text-lg resize-y focus:outline-none focus:ring-4 focus:ring-electric-blue focus:shadow-brutal-lg transition-shadow bg-white"
          placeholder="Write your markdown here... Use raw force."
        />
      </div>

      {/* 操作区 */}
      <div className="flex gap-4 pt-4 border-t-4 border-black">
        <BrutalButton type="submit" disabled={isSaving} variant="primary" size="lg" className="w-1/2">
          {isSaving ? "SAVING..." : "SAVE DRAFT"}
        </BrutalButton>
        <BrutalButton 
          type="button" 
          onClick={handleSubmitReview} 
          disabled={!revisionId} 
          variant="secondary" 
          size="lg" 
          className="w-1/2"
        >
          SUBMIT FOR REVIEW
        </BrutalButton>
      </div>
    </form>
  );
}