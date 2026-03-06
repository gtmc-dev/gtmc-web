import fs from "fs";
import path from "path";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { notFound } from "next/navigation";
import { BrutalCard } from "@/components/ui/brutal-card";
import Link from "next/link";

interface ArticlePageProps {
  params: Promise<{
    slug?: string[];
  }>;
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { slug } = await params;
  
  let filePathArray = slug || ["README.md"];
  
  // Try to find the correct file
  let rawPath = filePathArray.map(decodeURIComponent).join("/");
  
  // if no extension and no explicit file found, maybe it's a directory?
  // We'll just construct the path and check.
  let fullPath = path.join(process.cwd(), "assets", rawPath);

  if (!fs.existsSync(fullPath)) {
    // try exact match with .md
    if (fs.existsSync(fullPath + ".md")) {
      fullPath += ".md";
    } else {
      // try to check if it's a folder, then look for README.md
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          const readmePath = path.join(fullPath, "README.md");
          if (fs.existsSync(readmePath)) {
            fullPath = readmePath;
            rawPath = path.join(rawPath, "README.md");
          }
        }
      } catch (e) {
        // file doesn't exist at all
      }
    }
  }

  let content = "";
  try {
    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
       if (stat.isDirectory()) {
         const readmePath = path.join(fullPath, "README.md");
         if (fs.existsSync(readmePath)) {
            content = fs.readFileSync(readmePath, "utf-8");
         } else {
            notFound();
         }
       } else {
         notFound();
       }
    } else {
       content = fs.readFileSync(fullPath, "utf-8");
    }
  } catch (error) {
    // Since we handle both docs and 404
    if (rawPath.includes("404")) {
      content = "# 404 Not Found\n\nThe requested article is not available yet.";
    } else {
      notFound();
    }
  }

  // Also replace relative links within the markdown file to point to correct Next.js routes
  const relativeLinkPrefix = "/articles";

  // Calculate the path relative to assets for editing
  let editPath = path.relative(path.join(process.cwd(), "assets"), fullPath).replace(/\\/g, "/");

  return (
    <BrutalCard className="p-8 pb-32 min-h-screen bg-white relative">
      <div className="absolute top-8 right-8">
        <Link href={`/draft/new?file=${encodeURIComponent(editPath)}`}>
          <button className="flex items-center gap-2 border-2 border-black bg-neon-green hover:bg-black hover:text-white px-4 py-2 font-black text-sm uppercase transition-colors shadow-brutal-sm hover:shadow-none translate-x-0 translate-y-0 hover:translate-x-1 hover:translate-y-1">
            <span>EDIT</span>
          </button>
        </Link>
      </div>
      <div className="prose prose-lg prose-invert max-w-none text-black selection:bg-neon-green selection:text-black">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ node, ...props }) => <h1 className="text-4xl lg:text-5xl font-black uppercase mt-8 mb-6 tracking-tighter border-b-8 border-black pb-4" {...props} />,
            h2: ({ node, ...props }) => <h2 className="text-3xl font-black uppercase mt-8 mb-4 tracking-tighter text-tech-main border-b-4 border-black inline-block pr-4" {...props} />,
            h3: ({ node, ...props }) => <h3 className="text-2xl font-black uppercase mt-6 mb-3 tracking-tighter" {...props} />,
            p: ({ node, ...props }) => <p className="text-lg leading-relaxed mb-6 font-medium text-gray-800" {...props} />,
            a: ({ node, ...props }) => {
              let href = props.href || "";
              if (href.startsWith("./") || href.startsWith("../")) {
                 // Try to resolve relative paths
                 // Note: we'd need to correctly resolve based on `rawPath` directory
                 const currentDir = path.dirname("/" + rawPath).replace(/^\/+/, "");
                 try {
                    // Quick and dirty resolution
                    const resolved = path.join(currentDir, href).replace(/\\/g, "/");
                    href = `/articles/${resolved}`;
                 } catch(e) {}
              } else if (!href.startsWith("http") && !href.startsWith("#") && !href.startsWith("/")) {
                 // like "404.md"
                 const currentDir = path.dirname("/" + rawPath).replace(/^\/+/, "");
                 const resolved = path.join(currentDir, href).replace(/\\/g, "/");
                 href = `/articles/${resolved}`;
              }
              return <Link href={href} className="text-electric-blue border-b-2 border-electric-blue font-bold hover:text-hot-pink hover:bg-black transition-colors" {...props} />
            },
            ul: ({ node, ...props }) => <ul className="list-disc pl-6 mb-6 space-y-2 font-medium" {...props} />,
            ol: ({ node, ...props }) => <ol className="list-decimal pl-6 mb-6 space-y-2 font-medium" {...props} />,
            li: ({ node, ...props }) => <li className="marker:text-tech-main" {...props} />,
            blockquote: ({ node, ...props }) => (
              <blockquote className="border-l-8 border-black bg-gray-100 p-4 mb-6 italic font-medium" {...props} />
            ),
            img: ({ node, ...props }) => {
               let src = (props.src as string) || "";
               // check if the image is relative
               if (src.startsWith("./") || src.startsWith("../") || (!src.startsWith("http") && !src.startsWith("/"))) {
                   const currentDir = path.dirname("/" + rawPath).replace(/^\/+/, "");
                   const resolved = path.join(currentDir, src).replace(/\\/g, "/");
                   src = `/api/assets?path=${encodeURIComponent(resolved)}`;
               }
               // eslint-disable-next-line @next/next/no-img-element
               return <img src={src} alt={props.alt || ""} className="max-w-full h-auto border-4 border-black shadow-brutal-sm my-8" />
            },
            code: ({ node, className, children, ...props }) => {
              const match = /language-(\w+)/.exec(className || "");
              return match ? (
                <div className="my-6 border-4 border-black font-mono text-sm max-w-full overflow-hidden">
                  <div className="bg-black text-white px-4 py-1 text-xs font-bold uppercase tracking-widest flex justify-between items-center">
                    <span>{match[1]}</span>
                    <span className="opacity-50">/{'/'}/</span>
                  </div>
                  <pre className="p-4 bg-gray-50 overflow-x-auto text-black">
                    <code className={className} {...props}>
                      {children}
                    </code>
                  </pre>
                </div>
              ) : (
                <code className="bg-yellow-200 px-1 py-0.5 font-mono text-sm font-bold border border-black rounded-sm" {...props}>
                  {children}
                </code>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </div>
    </BrutalCard>
  );
}
