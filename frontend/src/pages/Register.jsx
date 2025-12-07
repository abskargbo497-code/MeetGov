import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './Register.css';

const Register = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'official',
    department: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    const result = await register({
      name: formData.name,
      email: formData.email,
      password: formData.password,
      role: formData.role,
      department: formData.department || undefined,
    });

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Registration failed');
    }

    setLoading(false);
  };

  return (
    <div className="register-page">
      <div className="register-container">
        <h1 className="register-title">Digital Meeting Assistant</h1>
        <h2 className="register-subtitle">Create Account</h2>
        <form onSubmit={handleSubmit} className="register-form">
          {error && <div className="register-error">{error}</div>}
          <div className="register-form-group">
            <label htmlFor="name">Full Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              placeholder="Enter your full name"
            />
          </div>
          <div className="register-form-group">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              required
              placeholder="Enter your email"
            />
          </div>
          <div className="register-form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              placeholder="Enter your password (min 6 characters)"
              minLength={6}
            />
          </div>
          <div className="register-form-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <input
              type="password"
              id="confirmPassword"
              name="confirmPassword"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
              placeholder="Confirm your password"
              minLength={6}
            />
          </div>
          <div className="register-form-group">
            <label htmlFor="role">Role</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="official">Official</option>
              <option value="secretary">Secretary</option>
            </select>
            <p className="register-role-note" style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.5rem' }}>
              Note: Admin role cannot be registered. Admin must be seeded in the database.
            </p>
          </div>
          <div className="register-form-group">
            <label htmlFor="department">Department (Optional)</label>
            <input
              type="text"
              id="department"
              name="department"
              value={formData.department}
              onChange={handleChange}
              placeholder="Enter your department"
            />
          </div>
          <button
            type="submit"
            className="register-button"
            disabled={loading}
          >
            {loading ? 'Creating account...' : 'Register'}
          </button>
        </form>
        <p className="register-login-link">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
};

export default Register;

