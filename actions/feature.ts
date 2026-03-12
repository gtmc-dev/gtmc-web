"use server"

import { prisma as db } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { revalidatePath } from "next/cache"

const QQ_BOT_WEBHOOK = process.env.QQ_BOT_WEBHOOK || ""

async function sendQQBotNotification(text: string) {
  if (!QQ_BOT_WEBHOOK) {
    console.log("[Mock QQ Bot] Would send payload to webhook: ", text);
    return;
  }
  
  try {
    await fetch(QQ_BOT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } })
    });
  } catch (error) {
    console.error("Failed to send QQ Bot Notification:", error);
  }
}

export async function createFeature(data: { title: string, content: string, tags: string[] }) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const feature = await db.feature.create({
    data: {
      title: data.title,
      content: data.content,
      tags: data.tags,
      authorId: session.user.id
    },
    include: {
      author: true
    }
  })

  // Send Notification
  await sendQQBotNotification(`New feature report from [${session.user.name || session.user.email}]: ${feature.title}\nID: ${feature.id}`)

  revalidatePath("/features")
  return { success: true, feature }
}

export async function updateFeature(id: string, data: { title: string, content: string, tags: string[] }) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const feature = await db.feature.findUnique({ where: { id } })
  if (!feature) throw new Error("Not found")
  
  // We only allow authors or admins to edit, assuming everyone can view but author modifies
  if (feature.authorId !== session.user.id && session.user.role !== "ADMIN") {
    throw new Error("Forbidden")
  }

  const updated = await db.feature.update({
    where: { id },
    data: {
      title: data.title,
      content: data.content,
      tags: data.tags
    }
  })

  revalidatePath("/features")
  revalidatePath(`/features/${id}`)
  return { success: true, feature: updated }
}

export async function assignFeature(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const feature = await db.feature.update({
    where: { id },
    data: {
      status: "IN_PROGRESS",
      assigneeId: session.user.id
    }
  })

  revalidatePath("/features")
  revalidatePath(`/features/${id}`)
  return { success: true, feature }
}

export async function unassignFeature(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")

  const feature = await db.feature.update({
    where: { id },
    data: {
      status: "PENDING",
      assigneeId: null
    }
  })

  revalidatePath("/features")
  revalidatePath(`/features/${id}`)
  return { success: true, feature }
}

export async function resolveFeature(id: string) {
  const session = await auth()
  if (!session?.user?.id) throw new Error("Unauthorized")
  
  if (session.user.role !== "ADMIN") throw new Error("Admin only")

  const feature = await db.feature.update({
    where: { id },
    data: {
      status: "RESOLVED"
    }
  })

  revalidatePath("/features")
  revalidatePath(`/features/${id}`)
  return { success: true, feature }
}