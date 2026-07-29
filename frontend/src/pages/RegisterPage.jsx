import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

const DEPARTMENTS = [
  'Computer Science',
  'Information Technology',
  'Electronics & Communication',
  'Electrical & Electronics',
  'Mechanical Engineering',
  'Civil Engineering',
];

export default function RegisterPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    college: '',
    department: DEPARTMENTS[0],
    password: '',
    confirmPassword: '',
  });
  const [localError, setLocalError] = useState('');
  const { register, loading, error, clearError } = useAuthStore();
  const navigate = useNavigate();

  const update = (field) => (e) => {
    setForm({ ...form, [field]: e.target.value });
    setLocalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    setLocalError('');

    if (form.password !== form.confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    const result = await register({
      name: form.name,
      email: form.email,
      college: form.college,
      department: form.department,
      password: form.password,
    });

    if (result.success) {
      navigate('/chat');
    }
  };

  const displayError = localError || error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-campusDark px-4 py-8">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-campusBlue/5 rounded-full blur-[120px]" />
      </div>

      <div className="w-full max-w-md animate-fade-in relative z-10">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold">
            <span className="text-campusBlue">Campus</span>
            <span className="text-campusText">GPT</span>
          </h1>
          <p className="text-campusMuted mt-2 text-sm">Create your account</p>
        </div>

        <div className="bg-campusCard border border-campusBorder/30 rounded-2xl p-8 shadow-2xl shadow-campusBlue/5">
          <h2 className="text-xl font-semibold text-campusText mb-6">Register</h2>

          {displayError && (
            <div className="mb-4 p-3 bg-campusError/10 border border-campusError/30 rounded-lg text-campusError text-sm animate-slide-up">
              {displayError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input id="reg-name" label="Full Name" placeholder="Aman K" value={form.name} onChange={update('name')} required />
            <Input id="reg-email" label="Email" type="email" placeholder="student@annauniv.edu" value={form.email} onChange={update('email')} required />
            <Input id="reg-college" label="College" placeholder="CEG, Anna University" value={form.college} onChange={update('college')} required />

            <div>
              <label htmlFor="reg-department" className="block text-sm font-medium text-campusMuted mb-1.5">Department</label>
              <select
                id="reg-department"
                value={form.department}
                onChange={update('department')}
                className="w-full px-4 py-2.5 bg-campusDark border border-campusBorder/50 rounded-lg text-campusText focus:outline-none focus:ring-2 focus:ring-campusBlue/50 focus:border-campusBlue transition-all"
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <Input id="reg-password" label="Password" type="password" placeholder="••••••••" value={form.password} onChange={update('password')} required />
            <Input id="reg-confirm" label="Confirm Password" type="password" placeholder="••••••••" value={form.confirmPassword} onChange={update('confirmPassword')} required />

            <Button type="submit" loading={loading} fullWidth>Create Account</Button>
          </form>

          <p className="mt-6 text-center text-campusMuted text-sm">
            Already have an account?{' '}
            <Link to="/login" className="text-campusBlue hover:text-campusAccent transition-colors font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
