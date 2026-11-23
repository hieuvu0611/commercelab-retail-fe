import { ChangePasswordForm } from '@/components/account/change-password-form'
import { DeleteAccountForm } from '@/components/account/delete-account-form'

export default function AccountSecurityPage() {
  return (
    <div className="space-y-10">
      <ChangePasswordForm />
      <hr className="max-w-[28rem] border-t border-rule-2" />
      <DeleteAccountForm />
    </div>
  )
}
