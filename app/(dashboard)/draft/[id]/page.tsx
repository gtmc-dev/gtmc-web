import { BrutalEditor } from "@/components/editor/brutal-editor";
import Link from "next/link";
import { BrutalButton } from "@/components/ui/brutal-button";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";

export default async function EditDraftPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  
  const draft = await prisma.revision.findUnique({
    where: { id },
  });

  if (!draft || draft.authorId !== session.user.id) {
    notFound();
  }

  // Only DRAFT or REJECTED statuses should be editable usually
  // If it is PENDING or APPROVED, maybe we show it as read-only, 
  // but let's let them view it in the editor for now.

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
      <div className="flex justify-between items-end border-b-4 border-black pb-4">
        <div className="flex items-center space-x-6">
          <Link href="/draft">
            <BrutalButton variant="ghost" size="sm">
              ← BACK
            </BrutalButton>
          </Link>
          <h1 className="text-4xl font-black uppercase tracking-tighter decoration-hot-pink decoration-8 underline underline-offset-4">
            EDIT SUBMISSION
          </h1>
        </div>
        <div className="text-sm font-bold bg-black text-white px-3 py-1">
          STATUS: {draft.status}
        </div>
      </div>

      <div className="bg-[#f4f4f0] border-4 border-black p-6 shadow-brutal mx-auto">
        {draft.status === "PENDING" || draft.status === "APPROVED" ? (
           <div className="mb-4 bg-yellow-200 border-2 border-black p-4 font-bold text-sm">
             Note: This revision is currently in {draft.status} state. Submitting changes will create or update it as a DRAFT.
           </div>
        ) : null}
        
        <BrutalEditor 
          initialData={{ 
            id: draft.id,
            title: draft.title, 
            content: draft.content, 
            filePath: draft.filePath || undefined,
            articleId: draft.articleId || undefined
          }} 
        />
      </div>
    </div>
  );
}
