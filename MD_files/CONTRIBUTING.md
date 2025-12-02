# Contributing Guide

Thank you for your interest in contributing to the Digital Meeting Assistant project! This document outlines the development workflow and guidelines for contributing.

## Git Workflow

### Branch Structure

#### Main Branches

- **`main`**: Production-ready code. This branch is always deployable.
- **`dev`**: Development branch. All feature branches are merged here first.

#### Branch Naming Conventions

All feature branches should follow these naming patterns:

- **`feature/*`**: New features or enhancements
  - Examples: `feature/user-authentication`, `feature/email-notifications`
  
- **`fix/*`**: Bug fixes
  - Examples: `fix/attendance-duplicate`, `fix/qr-scanner-camera`
  
- **`hotfix/*`**: Critical production fixes that need immediate attention
  - Examples: `hotfix/security-patch`, `hotfix/database-connection`
  
- **`chore/*`**: Maintenance tasks, dependencies, configuration
  - Examples: `chore/update-dependencies`, `chore/ci-cd-setup`

## Development Workflow

### 1. Create Feature Branch

Start by creating a new branch from `dev`:

```bash
# Make sure you're on the dev branch and it's up to date
git checkout dev
git pull origin dev

# Create and switch to your feature branch
git checkout -b feature/your-feature-name
```

### 2. Make Changes and Commit

Make your changes and commit them with clear, descriptive messages:

```bash
# Stage your changes
git add .

# Commit with a descriptive message
git commit -m "feat: add user profile page"
```

#### Commit Message Guidelines

Follow the [Conventional Commits](https://www.conventionalcommits.org/) format:

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Code style changes (formatting, missing semicolons, etc.)
- **refactor**: Code refactoring
- **test**: Adding or updating tests
- **chore**: Changes to build process or auxiliary tools

Examples:
```
feat: add QR code generation for meetings
fix: resolve duplicate attendance logging issue
docs: update API documentation
refactor: improve error handling in transcription service
```

### 3. Push Branch

Push your branch to the remote repository:

```bash
git push origin feature/your-feature-name
```

### 4. Open Pull Request

1. Go to the GitHub repository
2. Click "New Pull Request"
3. Select your branch (`feature/your-feature-name`) to merge into `dev`
4. Fill out the PR template:
   - **Title**: Clear description of changes
   - **Description**: What was changed and why
   - **Type**: Feature, Fix, Chore, etc.
   - **Testing**: How to test the changes
   - **Screenshots**: If applicable

### 5. Code Review

- Wait for at least one team member to review your PR
- Address any review comments
- Make additional commits if needed (they will be added to the PR)
- Ensure all CI checks pass

### 6. Merge into dev

Once approved:
- A maintainer will merge your PR into `dev`
- Your branch will be deleted (optional)
- The changes will be available in the `dev` branch

### 7. Deploy to Production

Periodically, `dev` is merged into `main` for production deployment:
- This is typically done by project maintainers
- Requires additional testing and approval

## Hotfix Workflow

For critical production issues:

```bash
# Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-issue

# Make fix and commit
git commit -m "fix: resolve critical security vulnerability"

# Push and create PR to main
git push origin hotfix/critical-issue
```

After merging to `main`, also merge back to `dev`:

```bash
git checkout dev
git merge main
git push origin dev
```

## Code Style Guidelines

### JavaScript/Node.js

- Use ES6+ features
- Follow ESLint configuration
- Use async/await for asynchronous operations
- Use meaningful variable and function names
- Add JSDoc comments for functions

### React

- Use functional components with hooks
- Keep components small and focused
- Use PropTypes or TypeScript for type checking
- Follow the existing component structure

### Git

- Keep commits atomic (one logical change per commit)
- Write clear commit messages
- Don't commit sensitive data (use .env files)
- Don't commit build artifacts or dependencies

## Testing

Before submitting a PR:

1. **Backend Testing:**
   ```bash
   cd backend
   npm test
   ```

2. **Frontend Testing:**
   ```bash
   cd frontend
   npm test
   ```

3. **Manual Testing:**
   - Test your changes locally
   - Verify no console errors
   - Test edge cases

## Pull Request Checklist

Before submitting a PR, ensure:

- [ ] Code follows the project's style guidelines
- [ ] All tests pass
- [ ] Documentation is updated (if needed)
- [ ] Commit messages follow conventions
- [ ] Branch is up to date with `dev`
- [ ] No merge conflicts
- [ ] Code is self-reviewed
- [ ] PR description is clear and complete

## Getting Help

If you need help:

1. Check existing documentation
2. Search existing issues and PRs
3. Ask in the project's discussion forum
4. Create an issue with the `question` label

## Reporting Bugs

When reporting bugs, include:

- **Description**: Clear description of the bug
- **Steps to Reproduce**: Detailed steps to reproduce the issue
- **Expected Behavior**: What should happen
- **Actual Behavior**: What actually happens
- **Environment**: OS, Node version, browser version
- **Screenshots**: If applicable
- **Logs**: Relevant error messages or logs

## Feature Requests

When requesting features:

- **Description**: Clear description of the feature
- **Use Case**: Why this feature is needed
- **Proposed Solution**: How you envision it working
- **Alternatives**: Other solutions you've considered

## Code of Conduct

- Be respectful and inclusive
- Welcome newcomers and help them learn
- Focus on constructive feedback
- Respect different viewpoints and experiences

## License

By contributing, you agree that your contributions will be licensed under the same license as the project.

---

Thank you for contributing to Digital Meeting Assistant! 🎉
