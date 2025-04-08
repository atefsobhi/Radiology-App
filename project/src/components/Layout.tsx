import { Link, Outlet } from '@tanstack/react-router';
import { Home, Activity, Users } from 'lucide-react';

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-8">
              <Link
                to="/"
                className="flex items-center space-x-2 text-indigo-600 font-semibold"
              >
                <Activity className="h-6 w-6" />
                <span>RadAnalytics</span>
              </Link>
              
              <div className="flex space-x-4">
                <Link
                  to="/"
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium
                    [&.active]:bg-indigo-50 [&.active]:text-indigo-700
                    hover:bg-gray-50 hover:text-gray-900`}
                >
                  <Home className="h-4 w-4" />
                  <span>Home</span>
                </Link>
                <Link
                  to="/workflow"
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium
                    [&.active]:bg-indigo-50 [&.active]:text-indigo-700
                    hover:bg-gray-50 hover:text-gray-900`}
                >
                  <Activity className="h-4 w-4" />
                  <span>Workflow</span>
                </Link>
                <Link
                  to="/staff-productivity"
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium
                    [&.active]:bg-indigo-50 [&.active]:text-indigo-700
                    hover:bg-gray-50 hover:text-gray-900`}
                >
                  <Users className="h-4 w-4" />
                  <span>Staff Productivity</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
