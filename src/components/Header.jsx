import React from "react";
import { NavLink } from "react-router-dom";

export default function Header() {
  return (
    <header className="bg-white shadow sticky-top">
      <nav className="container d-flex justify-content-between align-items-center py-3">
        <img src="/logo.png" alt="ZooGent Logo" style={{ height: '90px', width: '110px', marginTop: '-10px', marginBottom: '-10px' }} />
        <div>
          <NavLink to="/" className="me-4 text-primary text-decoration-none">
            Home
          </NavLink>
          <NavLink
            to="/dashboard"
            className="text-primary text-decoration-none"
          >
            Dashboard
          </NavLink>
        </div>
      </nav>
    </header>
  );
}
