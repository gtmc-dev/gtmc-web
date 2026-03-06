import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { BrutalButton } from "@/components/ui/brutal-button";
import { BrutalCard } from "@/components/ui/brutal-card";
import { approveRevisionAction, rejectRevisionAction } from "@/actions/admin";

export default async function ReviewDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/");
  }

  const { id } = await params;
  const revision = await prisma.revision.findUnique({
    where: { id },
    include: {
      author: true,
    },
  });

  if (!revision) {
    notFound();
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-8 space-y-8 pb-32">
      <Link href="/review">
        <BrutalButton variant="ghost" size="sm">
          ← BACK TO HUB
        </BrutalButton>
      </Link>

      <div className="flex flex-col md:flex-row justify-between items-end border-b-8 border-black pb-8 gap-4">
        <div>
          <h1 className="text-4xl lg:text-6xl font-black uppercase tracking-tighter mb-4 break-words leading-tight">
            {revision.title}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm font-bold bg-black text-white p-3 inline-flex border-2 border-black">
            <span className="text-electric-blue">AUTHOR:</span>
            <span className="uppercase">{revision.author?.name || "UNKNOWN REBEL"}</span>
            <span className="text-hot-pink px-2 opacity-50">/{'/'}/</span>
            <span className="text-neon-green">TARGET FILE:</span>
            <span>{revision.filePath || "NEW ARTICLE"}</span>
          </div>
        </div>

        {revision.status === "PENDING" && (
          <div className="flex gap-4 w-full md:w-auto">
            <form action={rejectRevisionAction}>
              <input type="hidden" name="revisionId" value={revision.id} />
              <BrutalButton type="submit" variant="secondary" className="w-full text-red-600 border-red-600 hover:bg-red-600 hover:text-white">
                REJECT
              </BrutalButton>
            </form>
            <form action={approveRevisionAction}>
              <input type="hidden" name="revisionId" value={revision.id} />
              <BrutalButton type="submit" variant="primary" className="w-full">
                APPROVE & MERGE
              </BrutalButton>
            </form>
          </div>
        )}
      </div>

      <div>
         <h2 className="text-2xl font-black uppercase border-b-4 border-black inline-block mb-4">CONTENT PREVIEW</h2>
      </div>

      <BrutalCard className="p-8">
        <div className="prose prose-lg prose-invert max-w-none text-black selection:bg-neon-green selection:text-black">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {revision.content}
          </ReactMarkdown>
        </div>
      </BrutalCard>
    </div>
  );
}
