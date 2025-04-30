import { Button } from "@/components/ui/button"
import { AvatarUpload } from "@/components/ui/avatar-upload"
import { useState } from "react"

function App() {
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const formData = new FormData()
    
    // Add the player data as JSON string
    const playerData = {
      player: (document.getElementById('playerId') as HTMLInputElement).value,
      name: (document.getElementById('playerName') as HTMLInputElement).value,
      account: 'ai-test',
    }
    formData.append('data', JSON.stringify(playerData))
    
    // Add avatar if selected
    if (avatarFile) {
      formData.append('avatar', avatarFile)
    }

    try {
      const response = await fetch('/api/create-player', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (response.ok) {
        alert('Player created successfully!')
        // Reset form
        const form = e.target as HTMLFormElement
        form.reset()
        setAvatarFile(null)
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error) {
      console.error('Error:', error)
      alert('Error creating player. Please try again.')
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            GameLayer Player Creation
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a new player account
          </p>
        </div>
        <form onSubmit={handleSubmit} className="bg-card rounded-lg shadow-lg p-6 space-y-6">
          <AvatarUpload
            onImageSelect={setAvatarFile}
            className="mb-6"
          />
          <div className="space-y-4">
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-foreground">
                Player ID
              </label>
              <input
                type="text"
                id="playerId"
                required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter player ID"
              />
            </div>
            <div>
              <label htmlFor="playerName" className="block text-sm font-medium text-foreground">
                Player Name
              </label>
              <input
                type="text"
                id="playerName"
                required
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter player name"
              />
            </div>
          </div>
          <Button type="submit" className="w-full">
            Create Player
          </Button>
        </form>
      </div>
    </div>
  )
}

export default App
