const webRoutes = require('../routes/webRoutes');
const publicRoutes = require('../routes/publicroute/publicroutes');
const authRoutes = require('../routes/privateroute/authroutes');
const superAdminRoutes = require('../routes/privateroute/superadminroutes');
const managerRoutes = require('../routes/privateroute/managerroutes');
const employeeRoutes = require('../routes/privateroute/employeeroutes');

function inspectRouter(router, routerName) {
    const routes = [];
    if (!router || !router.stack) return routes;

    router.stack.forEach(layer => {
        if (layer.route) {
            const methods = Object.keys(layer.route.methods).map(m => m.toUpperCase());
            const path = layer.route.path;
            const handlers = layer.route.stack.map(s => s.name || 'anonymous');
            routes.push({
                router: routerName,
                methods: methods.join(','),
                path: Array.isArray(path) ? path.join(' | ') : path,
                handlers
            });
        }
    });

    return routes;
}

const allRoutes = [
    ...inspectRouter(publicRoutes, 'PublicRoutes'),
    ...inspectRouter(authRoutes, 'AuthRoutes'),
    ...inspectRouter(superAdminRoutes, 'SuperAdminRoutes'),
    ...inspectRouter(managerRoutes, 'ManagerRoutes'),
    ...inspectRouter(employeeRoutes, 'EmployeeRoutes')
];

console.log(JSON.stringify(allRoutes, null, 2));
console.log(`TOTAL REGISTERED ROUTES: ${allRoutes.length}`);
