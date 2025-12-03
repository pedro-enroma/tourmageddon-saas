'use client'

import { useState } from 'react'
import { X, Shield, Smartphone, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mfaApi } from '@/lib/api-client'

interface MfaSetupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Step = 'intro' | 'qrcode' | 'verify' | 'success'

export default function MfaSetupModal({ isOpen, onClose, onSuccess }: MfaSetupModalProps) {
  const [step, setStep] = useState<Step>('intro')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationCode, setVerificationCode] = useState('')

  // MFA enrollment data
  const [enrollmentData, setEnrollmentData] = useState<{
    factorId: string
    qr_code: string
    secret: string
  } | null>(null)

  const handleStartEnrollment = async () => {
    setLoading(true)
    setError(null)

    try {
      const result = await mfaApi.enroll()
      if (result.error) throw new Error(result.error)

      setEnrollmentData({
        factorId: result.data!.factorId,
        qr_code: result.data!.qr_code,
        secret: result.data!.secret
      })
      setStep('qrcode')
    } catch (err) {
      console.error('Error enrolling in MFA:', err)
      setError(err instanceof Error ? err.message : 'Failed to start MFA enrollment')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyCode = async () => {
    if (!enrollmentData || !verificationCode) return

    setLoading(true)
    setError(null)

    try {
      const result = await mfaApi.verify(enrollmentData.factorId, '', verificationCode)
      if (result.error) throw new Error(result.error)

      setStep('success')
      setTimeout(() => {
        onSuccess()
        handleClose()
      }, 2000)
    } catch (err) {
      console.error('Error verifying MFA code:', err)
      setError(err instanceof Error ? err.message : 'Invalid verification code')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setStep('intro')
    setEnrollmentData(null)
    setVerificationCode('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="p-6 border-b flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <h2 className="text-xl font-semibold">Two-Factor Authentication</h2>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Step: Intro */}
          {step === 'intro' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">Secure Your Account</h3>
              <p className="text-gray-600 text-sm mb-6">
                Add an extra layer of security to your account by enabling two-factor authentication.
                You&apos;ll need an authenticator app like Google Authenticator or Authy.
              </p>
              <Button onClick={handleStartEnrollment} disabled={loading} className="w-full">
                {loading ? 'Setting up...' : 'Get Started'}
              </Button>
            </div>
          )}

          {/* Step: QR Code */}
          {step === 'qrcode' && enrollmentData && (
            <div>
              <div className="text-center mb-4">
                <h3 className="text-lg font-medium mb-2">Scan QR Code</h3>
                <p className="text-gray-600 text-sm">
                  Scan this QR code with your authenticator app
                </p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 flex justify-center mb-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={enrollmentData.qr_code}
                  alt="MFA QR Code"
                  className="w-48 h-48"
                />
              </div>

              <div className="mb-4">
                <p className="text-xs text-gray-500 mb-1">Can&apos;t scan? Enter this code manually:</p>
                <div className="bg-gray-100 rounded p-2 font-mono text-sm break-all">
                  {enrollmentData.secret}
                </div>
              </div>

              <Button onClick={() => setStep('verify')} className="w-full">
                I&apos;ve scanned the code
              </Button>
            </div>
          )}

          {/* Step: Verify */}
          {step === 'verify' && (
            <div>
              <div className="text-center mb-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Smartphone className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-lg font-medium mb-2">Enter Verification Code</h3>
                <p className="text-gray-600 text-sm">
                  Enter the 6-digit code from your authenticator app
                </p>
              </div>

              <div className="mb-6">
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full text-center text-2xl tracking-widest px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep('qrcode')} className="flex-1">
                  Back
                </Button>
                <Button
                  onClick={handleVerifyCode}
                  disabled={verificationCode.length !== 6 || loading}
                  className="flex-1"
                >
                  {loading ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Success */}
          {step === 'success' && (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-medium mb-2">MFA Enabled!</h3>
              <p className="text-gray-600 text-sm">
                Two-factor authentication has been successfully enabled for your account.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
