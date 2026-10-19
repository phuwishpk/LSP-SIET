import CreateForm from '@/components/CreateForm'
import MyRoadmaps from '@/components/MyRoadmaps'

export default function Home() {
  return (
    <main className="home">
      <div className="home-form">
        <CreateForm />
      </div>
      <div className="home-list">
        <MyRoadmaps />
      </div>
    </main>
  )
}
