import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { BrutalCard } from "@/components/ui/brutal-card";
import { BrutalInput } from "@/components/ui/brutal-input";
import { BrutalButton } from "@/components/ui/brutal-button";
import { BrutalAvatar } from "@/components/ui/brutal-avatar";
import { updateProfileAction } from "@/actions/profile";
import { SignOutButton } from "@/components/ui/sign-out-button";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="max-w-2xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-5xl font-black uppercase tracking-tighter mix-blend-difference text-tech-main">
          USER PROFILE
        </h1>
        <p className="text-xl font-bold mt-2 text-hot-pink">
          MANAGE YOUR IDENTITY
        </p>
      </div>

      <BrutalCard className="p-8">
        <form action={updateProfileAction} className="space-y-6">
          <div className="flex items-center space-x-6">
            <BrutalAvatar src={user.image} alt={user.name} size="lg" />
            <div className="flex-1">
              <label className="block text-sm font-black mb-2 uppercase">Avatar URL (Optional)</label>
              <BrutalInput 
                name="image" 
                defaultValue={user.image || ""} 
                placeholder="https://..." 
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-black mb-2 uppercase">Username</label>
            <BrutalInput 
              name="name" 
              defaultValue={user.name || ""} 
              required 
              placeholder="Your rebellous name" 
            />
          </div>

          <div>
            <label className="block text-sm font-black mb-2 uppercase text-gray-500">Email (Read Only)</label>
            <BrutalInput 
              defaultValue={user.email || ""} 
              disabled 
              className="bg-gray-100 text-gray-500 border-gray-400"
            />
          </div>
          
          <div>
            <label className="block text-sm font-black mb-2 uppercase text-gray-500">Role (Read Only)</label>
            <BrutalInput 
              defaultValue={user.role || "USER"} 
              disabled 
              className="bg-gray-100 text-gray-500 border-gray-400 uppercase font-black"
            />
          </div>

          <div className="pt-6">
            <BrutalButton type="submit" variant="primary" className="w-full">
              UPDATE IDENTITY
            </BrutalButton>
            <SignOutButton />
          </div>
        </form>
      </BrutalCard>
    </div>
  );
}
