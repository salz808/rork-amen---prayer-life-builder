import React, { Component, ReactNode } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { AlertTriangle, RotateCcw } from 'lucide-react-native';
import { Fonts } from '@/constants/fonts';
import { Sentry } from '@/lib/sentry';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View style={styles.container}>
          <View style={styles.content}>
            <AlertTriangle size={48} color="#D4766A" strokeWidth={1.5} />
            <Text style={[styles.title, { fontFamily: Fonts.serifLight }]}>
              Something went wrong
            </Text>
            <Text style={[styles.message, { fontFamily: Fonts.italic }]}>
              We encountered an unexpected error. Please try again.
            </Text>
            {__DEV__ && this.state.error && (
              <View style={styles.errorBox}>
                <Text style={[styles.errorText, { fontFamily: Fonts.titleLight }]}>
                  {this.state.error.toString()}
                </Text>
              </View>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                pressed && styles.buttonPressed,
              ]}
              onPress={this.handleReset}
            >
              <RotateCcw size={16} color="#C89A5A" />
              <Text style={[styles.buttonText, { fontFamily: Fonts.titleMedium }]}>
                TRY AGAIN
              </Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0804',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  content: {
    alignItems: 'center',
    gap: 16,
    maxWidth: 320,
  },
  title: {
    fontSize: 24,
    color: '#F5EFE7',
    marginTop: 12,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    color: 'rgba(245,239,231,0.7)',
    textAlign: 'center',
    lineHeight: 22,
  },
  errorBox: {
    backgroundColor: 'rgba(212,118,106,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(212,118,106,0.2)',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    width: '100%',
  },
  errorText: {
    fontSize: 12,
    color: '#D4766A',
    lineHeight: 18,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(200,154,90,0.5)',
    marginTop: 16,
  },
  buttonPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    fontSize: 12,
    letterSpacing: 2,
    color: '#C89A5A',
  },
});
