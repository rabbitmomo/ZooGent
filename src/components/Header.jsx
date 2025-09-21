import React from "react";
import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="bg-white shadow sticky-top">
      <nav className="container d-flex justify-content-between align-items-center py-3">
        <img 
          src="/logo.png" 
          alt="ZooGent Logo" 
          style={{ 
            height: '90px', 
            width: '110px', 
            marginTop: '-10px', 
            marginBottom: '-10px' 
          }} 
        />
        <div className="d-flex gap-4">
          <NavLink 
            to="/" 
            className={({ isActive }) => 
              `nav-link-custom ${isActive ? 'active' : ''}`
            }
          >
            <i className="fas fa-home"></i>
            Home
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => 
              `nav-link-custom ${isActive ? 'active' : ''}`
            }
          >
            <i className="fas fa-tachometer-alt"></i>
            Dashboard
          </NavLink>
        </div>
      </nav>
      
      <style jsx>{`
        .nav-link-custom {
          color: #232f3f;
          text-decoration: none;
          padding: 12px 20px;
          border-radius: 25px;
          font-weight: 600;
          transition: all 0.3s ease;
          position: relative;
          display: inline-flex;
          align-items: center;
          background: linear-gradient(135deg, transparent, transparent);
          border: 2px solid #232f3f;
        }
        
        .nav-link-custom:hover {
          color: white;
          background: linear-gradient(135deg, #ff9900, #e68a00);
          transform: translateY(-2px);
          box-shadow: 0 4px 15px rgba(255, 153, 0, 0.4);
          border-color: #ff9900;
        }
        
        .nav-link-custom.active {
          color: white;
          background: linear-gradient(135deg, #232f3f, #1a252f);
          box-shadow: 0 3px 12px rgba(35, 47, 63, 0.4);
          border-color: #232f3f;
        }
        
        .nav-link-custom.active:hover {
          background: linear-gradient(135deg, #ff9900, #e68a00);
          transform: translateY(-1px);
          border-color: #ff9900;
        }
        
        .nav-link-custom::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          border-radius: 25px;
          background: linear-gradient(45deg, rgba(255,255,255,0.1), rgba(255,255,255,0.3));
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .nav-link-custom:hover::before {
          opacity: 1;
        }
        
        .nav-link-custom i {
          font-size: 14px;
          transition: transform 0.3s ease;
        }
        
        .nav-link-custom:hover i {
          transform: scale(1.1);
        }
      `}</style>
    </header>
  );
}