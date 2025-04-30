import * as React from "react"
import { cn } from "@/lib/utils"

interface AvatarUploadProps extends React.HTMLAttributes<HTMLDivElement> {
  onImageSelect?: (file: File) => void
  defaultImage?: string
}

export function AvatarUpload({
  className,
  onImageSelect,
  defaultImage,
  ...props
}: AvatarUploadProps) {
  const [preview, setPreview] = React.useState<string | null>(defaultImage || null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB')
        return
      }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file')
        return
      }

      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
        onImageSelect?.(file)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className={cn("space-y-4", className)} {...props}>
      <div className="flex flex-col items-center space-y-4">
        <div className="relative w-32 h-32 rounded-full overflow-hidden border-2 border-input bg-muted">
          {preview ? (
            <img
              src={preview}
              alt="Avatar preview"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <svg
                className="w-12 h-12 text-muted-foreground"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          )}
        </div>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="image/*"
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
        >
          Upload Avatar
        </button>
      </div>
    </div>
  )
} 