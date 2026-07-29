import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    const result = await login(email, password);
    if (result.success) {
      navigate('/chat');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-campusDark px-4">
      {/* Background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-campusBlue/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">
            <span className="text-campusBlue">Campus</span>
            <span className="text-campusText">GPT</span>
          </h1>
          <p className="text-campusMuted mt-2 text-sm">AI Study Assistant for Anna University</p>
        </div>

        {/* Card */}
        <div className="bg-campusCard border border-campusBorder/30 rounded-2xl p-8 shadow-2xl shadow-campusBlue/5">
          <h2 className="text-xl font-semibold text-campusText mb-6">Welcome back</h2>

          {error && (
            <div className="mb-4 p-3 bg-campusError/10 border border-campusError/30 rounded-lg text-campusError text-sm animate-slide-up">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <Input
              id="login-email"
              label="Email"
              type="email"
              placeholder="student@annauniv.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              id="login-password"
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" loading={loading} fullWidth>
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-campusMuted text-sm">
            New here?{' '}
            <Link to="/register" className="text-campusBlue hover:text-campusAccent transition-colors font-medium">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
