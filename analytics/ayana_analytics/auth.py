"""Only Ayana admins (role ADMIN in the users table) can open the dashboards."""
import bcrypt
import streamlit as st
from sqlalchemy import text

from .data import engine


def _check(email: str, password: str):
    with engine().connect() as conn:
        row = conn.execute(text("SELECT name, password_hash FROM users WHERE email = :e AND role = 'ADMIN'"),
                           {"e": email.strip().lower()}).first()
    if row and bcrypt.checkpw(password.encode(), row.password_hash.encode()):
        return row.name
    return None


def require_admin():
    """Call at the top of every page. Shows the login form and stops the page until an admin signs in."""
    if st.session_state.get("admin_name"):
        with st.sidebar:
            st.caption(f"Signed in as {st.session_state.admin_name}")
            if st.button("Sign out", use_container_width=True):
                del st.session_state["admin_name"]
                st.rerun()
        return
    st.title("Ayana Insights")
    st.write("Sign in with your Ayana admin account.")
    with st.form("login"):
        email = st.text_input("Email")
        password = st.text_input("Password", type="password")
        if st.form_submit_button("Sign in", type="primary"):
            name = _check(email, password)
            if name:
                st.session_state.admin_name = name
                st.rerun()
            st.error("Wrong email or password, or this account is not an admin.")
    st.stop()
