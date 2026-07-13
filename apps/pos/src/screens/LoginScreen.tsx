import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import { login, type AuthUser } from '../lib/auth';
import { styles } from '../theme';

export function LoginScreen({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [identifier, setIdentifier] = useState('11144477735');
  const [password, setPassword] = useState('atendente123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError('');
    setLoading(true);
    try {
      const user = await login(identifier, password, 'smart2-terminal');
      onLogin(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.title}>PDV · Terminal</Text>
        <Text style={styles.subtitle}>Entre com seu CPF (atendente) ou e-mail.</Text>
        <TextInput
          style={styles.input}
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          placeholder="CPF ou e-mail"
          placeholderTextColor="#6b7794"
        />
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="Senha"
          placeholderTextColor="#6b7794"
        />
        <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? 'Entrando…' : 'Entrar'}</Text>
        </TouchableOpacity>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    </View>
  );
}
