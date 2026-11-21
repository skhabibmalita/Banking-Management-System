import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <p className="text-5xl font-extrabold text-brand">404</p>
        <h1 className="mt-3 text-2xl font-bold">This page does not exist</h1>
        <p className="mt-2 text-navy-500">Check the address, or head back to sign in.</p>
        <Link to="/login" className="btn btn-primary mt-6">Go to sign in</Link>
      </div>
    </div>
  );
}
