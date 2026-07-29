import api from './axios';

export async function loginAPI(email, password) {
  const res = await api.post('/auth/login', { email, password });
  return res.data; // { access_token, refresh_token, token_type }
}

export async function registerAPI(data) {
  // data: { email, password, name, college, department }
  const res = await api.post('/auth/register', data);
  return res.data;
}

export async function getMeAPI() {
  const res = await api.get('/auth/me');
  return res.data; // UserOut
}

export async function updateProfileAPI(data) {
  const res = await api.put('/auth/me', data);
  return res.data; // UserOut
}

export async function refreshTokenAPI(refreshToken) {
  const res = await api.post('/auth/refresh', { refresh_token: refreshToken });
  return res.data;
}
