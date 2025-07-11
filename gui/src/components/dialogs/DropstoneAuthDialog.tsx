import React, { useState, useContext } from 'react';
import { Button, Input } from '..';
import styled from 'styled-components';
import { lightGray, vscBackground, vscForeground } from '..';
import { X } from 'lucide-react';
import { IdeMessengerContext } from "@/context/IdeMessenger";

const DialogOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(8px);
`;

const DialogContent = styled.div`
  background-color: #1a1a1a;
  border: 1px solid #333;
  border-radius: 24px;
  padding: 3rem 2.5rem;
  width: 100%;
  max-width: 420px;
  color: #ffffff;
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.6);
  position: relative;
`;

const DialogTitle = styled.h1`
  margin: 0 0 0.5rem 0;
  color: #ffffff;
  text-align: center;
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
`;

const DialogSubtitle = styled.p`
  margin: 0 0 2.5rem 0;
  color: #888888;
  text-align: center;
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.4;
`;

const FormSection = styled.div`
  margin-bottom: 2rem;
`;

const TokenInputContainer = styled.div`
  position: relative;
  margin-bottom: 1.5rem;
`;

const StyledInput = styled(Input)`
  width: 100%;
  background-color: #2a2a2a;
  border: 1px solid #404040;
  border-radius: 16px;
  padding: 1rem 1.25rem;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.9rem;
  color: #ffffff;
  min-height: 52px;
  transition: all 0.2s ease;

  &:focus {
    border-color: #4f46e5;
    box-shadow: 0 0 0 3px rgba(79, 70, 229, 0.15);
    outline: none;
    background-color: #333333;
  }

  &::placeholder {
    color: #666666;
  }
`;

const OrDivider = styled.div`
  display: flex;
  align-items: center;
  margin: 1.5rem 0;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #333333;
  }

  span {
    padding: 0 1rem;
    color: #666666;
    font-size: 0.85rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
`;

const LoginButton = styled(Button)`
  width: 100%;
  background-color: #4f46e5;
  border: 1px solid #4f46e5;
  border-radius: 16px;
  padding: 1rem 1.5rem;
  font-weight: 600;
  font-size: 0.95rem;
  color: white;
  min-height: 52px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 1rem;

  &:hover {
    background-color: #3730a3;
    border-color: #3730a3;
    transform: translateY(-1px);
    box-shadow: 0 8px 25px rgba(79, 70, 229, 0.3);
  }

  &:disabled {
    background-color: #2a2a2a;
    border-color: #404040;
    color: #666666;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }
`;

const HelpText = styled.div`
  text-align: center;
  margin-top: 1.5rem;
  font-size: 0.85rem;
  color: #666666;
  line-height: 1.5;
`;

const LinkButton = styled.button`
  color: #4f46e5;
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  transition: all 0.2s ease;

  &:hover {
    background-color: rgba(79, 70, 229, 0.1);
    text-decoration: underline;
  }
`;

const ErrorMessage = styled.div`
  color: #ef4444;
  font-size: 0.875rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background-color: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 12px;
  text-align: center;
`;

const SuccessMessage = styled.div`
  color: #10b981;
  font-size: 0.875rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  background-color: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.2);
  border-radius: 12px;
  text-align: center;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  color: #888888;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  z-index: 10;

  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
    color: #ffffff;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

interface DropstoneAuthDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthenticate: (token: string) => Promise<boolean>;
}

export const DropstoneAuthDialog: React.FC<DropstoneAuthDialogProps> = ({
  isOpen,
  onClose,
  onAuthenticate
}) => {
  const ideMessenger = useContext(IdeMessengerContext);
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  if (!isOpen) return null;

  const handleAuth = async () => {
    setIsLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!token.trim()) {
        setError('Please enter a JWT token');
        return;
      }

      const result = await onAuthenticate(token.trim());

      if (result) {
        setSuccess('Authentication successful!');
        setTimeout(() => {
          onClose();
          // Clear form on successful auth
          setToken('');
          setError('');
          setSuccess('');
        }, 1500);
      } else {
        setError('Authentication failed. Please check your JWT token.');
      }
    } catch (err) {
      setError('Authentication failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAuth();
    }
  };

  const openDropstoneServer = () => {
    const url = 'http://localhost:3002/dashboard';
    try {
      // Prefer VS Code command to open external URL when running inside the IDE
      // @ts-ignore – not part of protocol typings
      ideMessenger?.post('invokeVSCodeCommandById', {
        commandId: 'vscode.openExternal',
        args: [url],
      });
    } catch (err) {
      console.warn('Failed to open link via VS Code command, falling back to window.open', err);
      window.open(url, '_blank');
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
      // Clear form on close
      setToken('');
      setError('');
      setSuccess('');
    }
  };

  return (
    <DialogOverlay onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <DialogContent>
        <CloseButton onClick={handleClose} disabled={isLoading}>
          <X size={20} />
        </CloseButton>
        <DialogTitle>Welcome back</DialogTitle>
        <DialogSubtitle>Sign in to your account to continue</DialogSubtitle>

        <FormSection>
          <TokenInputContainer>
            <StyledInput
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              placeholder="Paste your JWT token here..."
            />
          </TokenInputContainer>

          <LoginButton
            onClick={handleAuth}
            disabled={isLoading || !token.trim()}
          >
            {isLoading ? 'Signing in...' : 'Sign in with JWT Token'}
          </LoginButton>
        </FormSection>

        <OrDivider>
          <span>OR</span>
        </OrDivider>

        <HelpText>
          Need a JWT token?{' '}
          <LinkButton onClick={openDropstoneServer}>
            Get one from the Dropstone Dashboard
          </LinkButton>
        </HelpText>

        {error && <ErrorMessage>{error}</ErrorMessage>}
        {success && <SuccessMessage>{success}</SuccessMessage>}
      </DialogContent>
    </DialogOverlay>
  );
};
