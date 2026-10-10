import { Navigate, Route } from 'react-router'
import { AnimatedRoutes } from './app/AnimatedRoutes'
import { CreateTutorPage } from './pages/CreateTutorPage'
import { HomePage } from './pages/HomePage'
import { LessonPage } from './pages/LessonPage'

export default function App() {
  return (
    <AnimatedRoutes>
      <Route path="/" element={<HomePage />} />
      <Route path="/new" element={<CreateTutorPage />} />
      <Route path="/tutor/:id" element={<LessonPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </AnimatedRoutes>
  )
}
