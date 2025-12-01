"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/providers/auth-provider";
import { createApiClient } from "@/lib/api";
import { ArrowRight, KeyRound, Zap } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken, token } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (token) {
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    }
  }, [token, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!inputValue.trim()) {
      setError("请输入 Admin Token");
      return;
    }

    setError("");
    setIsLoading(true);

    try {
      const tempClient = createApiClient({ getToken: () => inputValue });
      await tempClient.get("/admin/keys?page=1&page_size=1");
      setToken(inputValue);
      toast.success("登录成功");
      const redirect = searchParams.get("redirect") || "/dashboard";
      router.push(redirect);
    } catch {
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("admin_token");
      }
      toast.error("Admin Token 无效，请检查后重试");
    } finally {
      setIsLoading(false);
    }
  };

  if (token) return null;

  return (
    <div className="login-page">
      <style jsx>{`
        .login-page {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: linear-gradient(160deg, #141312 0%, #1c1b19 50%, #1a1918 100%);
        }
        .login-card {
          width: 100%;
          max-width: 360px;
          padding: 36px;
          border-radius: 24px;
          background: linear-gradient(180deg, #242320 0%, #1e1d1b 100%);
          border: 1px solid rgba(150, 145, 138, 0.15);
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        }
        .logo-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #0d9488 0%, #0a756a 100%);
          box-shadow: 0 2px 12px rgba(13, 148, 136, 0.25);
          flex-shrink: 0;
        }
        .header {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 36px;
        }
        .brand-name {
          font-size: 15px;
          font-weight: 600;
          color: #94cdc6;
          letter-spacing: 0.02em;
        }
        .brand-desc {
          font-size: 12px;
          color: #9a958e;
        }
        .title {
          font-size: 26px;
          font-weight: 600;
          color: #f5f4f2;
          margin-bottom: 8px;
        }
        .subtitle {
          font-size: 14px;
          color: #9a958e;
          margin-bottom: 32px;
        }
        .form-label {
          display: block;
          font-size: 13px;
          font-weight: 500;
          color: #b0aba4;
          margin-bottom: 10px;
        }
        .input-wrapper {
          position: relative;
          margin-bottom: 20px;
        }
        .token-input {
          width: 100%;
          height: 48px;
          padding: 0 16px 0 44px;
          border-radius: 12px;
          font-size: 14px;
          color: #f5f4f2;
          background: rgba(20, 19, 18, 0.9);
          border: 1px solid rgba(150, 145, 138, 0.25);
          outline: none;
          transition: all 0.2s;
          box-sizing: border-box;
        }
        .token-input::placeholder {
          color: #706b64;
        }
        .token-input:focus {
          border-color: rgba(13, 148, 136, 0.6);
          box-shadow: 0 0 0 3px rgba(13, 148, 136, 0.12);
        }
        .error-text {
          font-size: 12px;
          color: #e57373;
          margin-top: 8px;
        }
        .submit-btn {
          width: 100%;
          height: 48px;
          border-radius: 12px;
          font-size: 15px;
          font-weight: 500;
          color: #052e2a;
          background: linear-gradient(135deg, #5ecdc0 0%, #0d9488 100%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.2s;
          box-shadow: 0 2px 12px rgba(13, 148, 136, 0.25);
        }
        .submit-btn:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 4px 16px rgba(13, 148, 136, 0.35);
        }
        .submit-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .spinner {
          width: 18px;
          height: 18px;
          border: 2px solid rgba(5, 46, 42, 0.3);
          border-top-color: #052e2a;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .help-text {
          margin-top: 28px;
          font-size: 12px;
          color: #706b64;
          line-height: 1.6;
        }
        .help-label {
          color: #9a958e;
        }
      `}</style>

      <div className="login-card">
        <div className="header">
          <div className="logo-icon">
            <Zap size={22} color="#052e2a" />
          </div>
          <div>
            <div className="brand-name">AUTOROUTER</div>
            <div className="brand-desc">管理员控制台</div>
          </div>
        </div>

        <h1 className="title">欢迎回来</h1>
        <p className="subtitle">使用 Admin Token 继续访问</p>

        <form onSubmit={handleSubmit}>
          <label className="form-label">Admin Token</label>
          <div className="input-wrapper">
            <KeyRound size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#9a958e', pointerEvents: 'none' }} />
            <input
              type="password"
              className="token-input"
              placeholder="请输入您的 Admin Token"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isLoading}
            />
          </div>
          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="submit-btn" disabled={isLoading}>
            {isLoading ? (
              <>
                <div className="spinner" />
                验证中...
              </>
            ) : (
              <>
                登录
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        <p className="help-text">
          <span className="help-label">提示：</span>
          Admin Token 由系统管理员在服务端配置时生成。
        </p>
      </div>
    </div>
  );
}
