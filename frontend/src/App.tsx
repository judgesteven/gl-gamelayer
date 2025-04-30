import { Button } from "@/components/ui/button"

function App() {
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
        <div className="bg-card rounded-lg shadow-lg p-6 space-y-6">
          <div className="space-y-4">
            <div>
              <label htmlFor="playerId" className="block text-sm font-medium text-foreground">
                Player ID
              </label>
              <input
                type="text"
                id="playerId"
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
                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                placeholder="Enter player name"
              />
            </div>
            <div>
              <label htmlFor="playerEmail" className="block text-sm font-medium text-foreground">
                Email Address
              </label>
              <input
                type="email"
                id="playerEmail"
                disabled
                className="mt-1 block w-full rounded-md border border-input bg-muted px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-not-allowed"
                placeholder="Coming soon"
              />
            </div>
          </div>
          <Button className="w-full">
            Create Player
          </Button>
        </div>
      </div>
    </div>
  )
}

export default App
