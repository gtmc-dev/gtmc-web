import { prisma as db } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import Link from "next/link"
import { Feature } from "@prisma/client"
import { BrutalCard } from "@/components/ui/brutal-card"
import { BrutalButton } from "@/components/ui/brutal-button"

export default async function FeaturesPage() {
  const session = await auth()
  
  const features = await db.feature.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      author: {
        select: { name: true, image: true, email: true }
      },
      assignee: {
        select: { name: true, image: true, email: true }
      }
    }
  })

  return (
    <div className="container mx-auto p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tighter uppercase border-b-2 border-tech-main pb-2 pr-8 inline-block">Feature Reports</h1>
          <p className="text-sm mt-2 font-mono text-zinc-600">Bug reports, feature requests, and issue tracking.</p>
        </div>
        
        {session?.user && (
          <Link href="/features/new" passHref>
            <BrutalButton variant="primary">REPORT NEW FEATURE</BrutalButton>
          </Link>
        )}
      </div>

      <div className="grid gap-4 mt-8 pt-4">
        {features.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-zinc-300 font-mono text-zinc-500">
            No features reported yet.
          </div>
        ) : (
          features.map(feature => (
            <Link key={feature.id} href={`/features/${feature.id}`} className="block">
              <BrutalCard className="hover:border-zinc-800 transition-colors flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center p-4 cursor-pointer">
                <div className="space-y-2 flex-grow">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={feature.status} />
                    <h2 className="text-xl font-bold">{feature.title}</h2>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 text-xs font-mono">
                    <span className="bg-zinc-100 px-2 py-0.5 border border-zinc-200">
                      Author: {feature.author?.name || "Unknown"}
                    </span>
                    <span className="bg-zinc-100 px-2 py-0.5 border border-zinc-200 text-zinc-500">
                      {new Date(feature.createdAt).toLocaleDateString()}
                    </span>
                    {feature.assignee && (
                      <span className="bg-blue-50 text-blue-800 px-2 py-0.5 border border-blue-200">
                        Assignee: {feature.assignee.name || "Unknown"}
                      </span>
                    )}
                  </div>
                  
                  {feature.tags && feature.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {feature.tags.map(tag => (
                        <span key={tag} className="text-xs bg-zinc-800 text-white px-2 py-0.5">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </BrutalCard>
            </Link>
          ))
        )}
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  let styles = "px-2 py-1 text-xs font-bold uppercase border"
  let label = status

  switch (status) {
    case "PENDING":
      styles += " bg-yellow-100 border-yellow-400 text-yellow-800"
      label = "待解决"
      break
    case "IN_PROGRESS":
      styles += " bg-blue-100 border-blue-400 text-blue-800"
      label = "解决中"
      break
    case "RESOLVED":
      styles += " bg-green-100 border-green-400 text-green-800"
      label = "已解决"
      break
    default:
      styles += " bg-zinc-100 border-zinc-300 text-zinc-600"
  }

  return <span className={styles}>{label}</span>
}