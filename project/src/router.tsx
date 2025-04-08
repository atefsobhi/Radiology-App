import { Router, Route, RootRoute } from '@tanstack/react-router';
import Layout from './components/Layout';
import HomePage from './pages/HomePage';
import WorkflowPage from './pages/WorkflowPage';
import StaffProductivityPage from './pages/StaffProductivityPage';

const rootRoute = new RootRoute({
  component: Layout,
});

const indexRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/',
  component: HomePage,
});

const workflowRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/workflow',
  component: WorkflowPage,
});

const staffProductivityRoute = new Route({
  getParentRoute: () => rootRoute,
  path: '/staff-productivity',
  component: StaffProductivityPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  workflowRoute,
  staffProductivityRoute,
]);

export const router = new Router({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
