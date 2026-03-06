import { BrutalCard } from "@/components/ui/brutal-card";
import { BrutalButton } from "@/components/ui/brutal-button";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function ReviewHubPage() {
  const session = await auth();
  
  if (!session?.user || session.user.role !== "ADMIN") {
    return (
      <div className="max-w-6xl mx-auto p-8 text-center mt-20">
        <h1 className="text-6xl font-black text-red-500 uppercase">ACCESS DENIED</h1>
        <p className="text-xl font-bold mt-4">ADMIM CLEARANCE REQUIRED.</p>
        <Link href="/">
          <BrutalButton variant="primary" className="mt-8">RETURN TO BASE</BrutalButton>
        </Link>
      </div>
    );
  }

  const pendingRevisions = await prisma.revision.findMany({
    where: {
      status: "PENDING",
    },
    include: {
      author: true,
    },
    orderBy: {
      updatedAt: "asc",
    },
  });

  return (
    <div className="max-w-6xl mx-auto p-8 space-y-12">
      <div className="border-b-8 border-black pb-6">
        <h1 className="text-6xl font-black uppercase tracking-tighter mix-blend-difference">
          REVIEW HUB
        </h1>
        <p className="text-xl font-bold mt-2 text-hot-pink">
          APPROVE CONTENT. MERGE REBELLION.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {pendingRevisions.length === 0 ? (
          <div className="py-12 text-center border-4 border-dashed border-black">
            <h2 className="text-3xl font-black text-gray-400">NO PENDING REVIEWS. SILENCE IN THE COMM.</h2>
          </div>
        ) : (
          pendingRevisions.map((rev) => (
            <BrutalCard key={rev.id} color="white" className="flex flex-col md:flex-row justify-between items-start md:items-center p-6 space-y-4 md:space-y-0">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                   <span className="bg-electric-blue text-white px-2 py-1 text-xs font-black border-2 border-black">PENDING</span>
                   <span className="text-sm font-bold text-gray-500">{rev.updatedAt.toLocaleString()}</span>
                </div>
                <h3 className="text-3xl font-black uppercase tracking-tight mb-2">
                  {rev.title || "UNTITLED"}
                </h3>
                <p className="text-gray-600 font-bold text-sm">
                  Submited by <span className="text-black">{rev.author?.name || rev.author?.email || "UNKNOWN"}</span>
                </p>
                {rev.filePath && (
                  <p className="text-hot-pink font-mono text-xs mt-2 font-black border border-hot-pink inline-block px-2">
                     TARGET: {rev.filePath}
                  </p>
                )}
              </div>

              <div className="w-full md:w-auto flex gap-4 md:flex-col lg:flex-row">
                <Link href={`/review/${rev.id}`}>
                  <BrutalButton variant="primary" className="w-full md:w-auto whitespace-nowrap">
                    REVIEW CONTENT →
                  </BrutalButton>
                </Link>
              </div>
            </BrutalCard>
          ))
        )}
      </div>
    </div>
  );
}
